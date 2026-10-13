import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { isPrivateRef } from "@/lib/storage";

/**
 * Derechos de las personas (RGPD art. 15-22) y conservación limitada.
 * - Exportación: todos los datos asociados a un email, en JSON legible (acceso y portabilidad).
 * - Supresión: se borra lo que no hay obligación de conservar y se ANONIMIZA lo que sí
 *   (importes de pedidos para la contabilidad), irreversiblemente.
 */
export const RETENTION = {
  ordersYears: 6, // Código de Comercio art. 30: libros y justificantes durante 6 años
  referencePhotosDays: 90,
  quotesNotAcceptedMonths: 12,
  abandonedCartsDays: 30,
  loginAttemptsDays: 90,
  expiredSessionsDays: 30,
  inactiveCustomersMonths: 24,
  dataRequestsYears: 3,
  jobsDoneDays: 30,
  jobsFailedDays: 90,
  unpublishedReviewsMonths: 12,
  stripeEventsDays: 90,
  auditYears: 2,
} as const;

const ERASED = "Datos eliminados";

/**
 * Borrado de fotos privadas a través de la cola (reintentos y alerta si falla definitivamente):
 * se encola en la MISMA transacción que quita la referencia, así nunca queda una foto huérfana
 * en silencio. El payload solo lleva la referencia aleatoria del archivo (sin datos personales).
 */
async function scheduleDeletion(client: Tx | typeof db, refs: string[]) {
  for (const ref of refs) await enqueue("storage.delete-private", { ref }, { dedupeKey: `delete:${ref}`, tx: client as Tx });
}

/** Anonimiza un pedido: conserva importes, fechas y productos; borra a la persona. */
export async function anonymizeOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, anonymizedAt: true, items: { select: { referencePhotoUrl: true } }, quoteRequest: { select: { id: true, referencePhotoUrl: true } } },
  });
  if (!order || order.anonymizedAt) return [];
  await tx.order.update({
    where: { id: orderId },
    data: {
      customerName: ERASED,
      customerEmail: "",
      customerEmailHash: `erased:${orderId}`,
      customerPhone: "",
      customerPhoneHash: null,
      address: null,
      postalCode: null,
      city: null,
      notes: null,
      adminNotes: null,
      rejectionReason: null,
      customerId: null,
      marketingConsent: false,
      anonymizedAt: new Date(),
    },
  });
  // customSpec puede llevar textos de la persona (inscripción de la tarta): se elimina entero
  await tx.orderItem.updateMany({ where: { orderId }, data: { dedication: null, referencePhotoUrl: null, customSpec: Prisma.DbNull } });
  await tx.orderStatusEvent.updateMany({ where: { orderId }, data: { note: null } });
  // El presupuesto aceptado que originó el pedido lleva los mismos datos: se anonimiza con él
  if (order.quoteRequest) {
    await tx.quoteRequest.update({
      where: { id: order.quoteRequest.id },
      data: { customerName: ERASED, customerEmail: "", customerEmailHash: `erased:q:${order.quoteRequest.id}`, customerPhone: "", notes: null, referencePhotoUrl: null, spec: { anonimizado: true } },
    });
  }
  const photos = [...order.items.map((i) => i.referencePhotoUrl), order.quoteRequest?.referencePhotoUrl].filter(isPrivateRef);
  await scheduleDeletion(tx, photos);
  return photos;
}

export async function exportSubjectData(emailHash: string) {
  const [customer, orders, quotes, giftCards, carts, requests] = await Promise.all([
    db.customer.findUnique({ where: { emailHash }, include: { reminders: true } }),
    db.order.findMany({ where: { customerEmailHash: emailHash }, include: { items: true, history: { select: { status: true, note: true, createdAt: true } } }, orderBy: { createdAt: "asc" } }),
    db.quoteRequest.findMany({ where: { customerEmailHash: emailHash }, orderBy: { createdAt: "asc" } }),
    db.giftCard.findMany({ where: { OR: [{ purchaserEmailHash: emailHash }, { recipientEmailHash: emailHash }] } }),
    db.abandonedCart.findMany({ where: { emailHash } }),
    db.dataRequest.findMany({ where: { emailHash }, select: { type: true, status: true, createdAt: true, resolvedAt: true } }),
  ]);
  // Sin campos internos (huellas, tokens de acceso, identificadores de pago)
  const strip = <T extends Record<string, unknown>>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k) && !/Hash$|Token$|^accessToken$|^stripe|^idempotency|^requestHash$|^checkoutUrl$/.test(k)));
  return {
    generatedAt: new Date().toISOString(),
    description: "Datos personales que conservamos asociados a este email (art. 15 y 20 RGPD).",
    customer: customer ? { ...strip(customer, ["unsubscribeToken"]), reminders: customer.reminders.map((r) => strip(r, [])) } : null,
    orders: orders.map((o) => ({ ...strip(o, ["adminNotes"]), items: o.items.map((i) => strip(i, ["referencePhotoUrl"])), history: o.history })),
    quotes: quotes.map((q) => strip(q, ["referencePhotoUrl"])),
    giftCards: giftCards.map((g) => strip(g, ["code"])),
    savedCarts: carts.map((c) => ({ createdAt: c.createdAt, consentAt: c.consentAt, cart: c.cart })),
    privacyRequests: requests,
  };
}

/**
 * Supresión. Los pedidos de los últimos 6 años se anonimizan (obligación contable); los pedidos
 * aún pendientes de entregar no se tocan (hay que cancelarlos antes) y se informa.
 */
export async function eraseSubjectData(emailHash: string): Promise<{ anonymizedOrders: number; activeOrders: number; deleted: Record<string, number> }> {
  const active = await db.order.count({
    where: { customerEmailHash: emailHash, status: { in: ["PENDING_PAYMENT", "PENDING", "ACCEPTED", "IN_PREPARATION", "READY"] } },
  });
  const photos: string[] = [];
  const result = await db.$transaction(
    async (tx) => {
      const orders = await tx.order.findMany({
        where: { customerEmailHash: emailHash, status: { notIn: ["PENDING_PAYMENT", "PENDING", "ACCEPTED", "IN_PREPARATION", "READY"] } },
        select: { id: true },
      });
      for (const o of orders) photos.push(...(await anonymizeOrder(tx, o.id)));
      const quotes = await tx.quoteRequest.findMany({ where: { customerEmailHash: emailHash }, select: { id: true, referencePhotoUrl: true, order: { select: { id: true } } } });
      const quotePhotos = quotes.map((q) => q.referencePhotoUrl).filter(isPrivateRef);
      photos.push(...quotePhotos);
      await scheduleDeletion(tx, quotePhotos);
      const unlinked = quotes.filter((q) => !q.order).map((q) => q.id);
      const deletedQuotes = await tx.quoteRequest.deleteMany({ where: { id: { in: unlinked } } });
      await tx.quoteRequest.updateMany({
        where: { customerEmailHash: emailHash },
        data: { customerName: ERASED, customerEmail: "", customerEmailHash: `erased:${Date.now()}`, customerPhone: "", notes: null, referencePhotoUrl: null, spec: { anonimizado: true } },
      });
      await tx.giftCard.updateMany({ where: { purchaserEmailHash: emailHash }, data: { purchaserName: ERASED, purchaserEmail: "", purchaserEmailHash: "erased", message: null } });
      await tx.giftCard.updateMany({ where: { recipientEmailHash: emailHash }, data: { recipientName: null, recipientEmail: null, recipientEmailHash: null, message: null } });
      const carts = await tx.abandonedCart.deleteMany({ where: { emailHash } });
      const customers = await tx.customer.deleteMany({ where: { emailHash } });
      return { anonymizedOrders: orders.length, deleted: { quotes: deletedQuotes.count, carts: carts.count, customers: customers.count } };
    },
    { timeout: 30_000 },
  );
  return { ...result, activeOrders: active };
}

/** Aplica los plazos de conservación (lo ejecuta el cron diario). Idempotente. */
export async function applyRetention() {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000);
  const report: Record<string, number> = {};

  // Pedidos de hace más de 6 años: anonimizados
  const oldOrders = await db.order.findMany({ where: { anonymizedAt: null, createdAt: { lt: days(RETENTION.ordersYears * 366) } }, select: { id: true }, take: 500 });
  const photos: string[] = [];
  for (const o of oldOrders) photos.push(...(await db.$transaction((tx) => anonymizeOrder(tx, o.id))));
  report.ordersAnonymized = oldOrders.length;

  // Fotos de referencia: 90 días después de la fecha del pedido
  const cutoff = days(RETENTION.referencePhotosDays).toISOString().slice(0, 10);
  const withPhotos = await db.orderItem.findMany({
    where: { referencePhotoUrl: { not: null }, order: { scheduledDate: { lt: cutoff } } },
    select: { id: true, referencePhotoUrl: true },
    take: 1000,
  });
  for (const item of withPhotos) {
    const refs = isPrivateRef(item.referencePhotoUrl) ? [item.referencePhotoUrl] : [];
    photos.push(...refs);
    await db.$transaction(async (tx) => {
      await tx.orderItem.update({ where: { id: item.id }, data: { referencePhotoUrl: null } });
      await scheduleDeletion(tx, refs);
    });
  }
  const oldQuotePhotos = await db.quoteRequest.findMany({ where: { referencePhotoUrl: { not: null }, createdAt: { lt: days(RETENTION.referencePhotosDays + 60) } }, select: { id: true, referencePhotoUrl: true }, take: 1000 });
  for (const q of oldQuotePhotos) {
    const refs = isPrivateRef(q.referencePhotoUrl) ? [q.referencePhotoUrl] : [];
    photos.push(...refs);
    await db.$transaction(async (tx) => {
      await tx.quoteRequest.update({ where: { id: q.id }, data: { referencePhotoUrl: null } });
      await scheduleDeletion(tx, refs);
    });
  }
  report.photosScheduledForDeletion = photos.length;

  // Tarjetas regalo de hace más de 6 años: se conservan importes y estado, no las personas
  const oldCards = await db.giftCard.updateMany({
    where: { createdAt: { lt: days(RETENTION.ordersYears * 366) }, NOT: { purchaserEmailHash: "erased" } },
    data: { purchaserName: ERASED, purchaserEmail: "", purchaserEmailHash: "erased", recipientName: null, recipientEmail: null, recipientEmailHash: null, message: null },
  });
  report.giftCardsAnonymized = oldCards.count;

  const r = await Promise.all([
    db.quoteRequest.deleteMany({ where: { status: { in: ["NEW", "QUOTED", "REJECTED", "EXPIRED"] }, order: null, createdAt: { lt: days(RETENTION.quotesNotAcceptedMonths * 31) } } }),
    db.abandonedCart.deleteMany({ where: { updatedAt: { lt: days(RETENTION.abandonedCartsDays) } } }),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: days(RETENTION.loginAttemptsDays) } } }),
    db.adminSession.deleteMany({ where: { OR: [{ expiresAt: { lt: days(RETENTION.expiredSessionsDays) } }, { revokedAt: { lt: days(RETENTION.expiredSessionsDays) } }] } }),
    db.customer.deleteMany({ where: { marketingConsent: false, orders: { none: {} }, reminders: { none: { active: true } }, updatedAt: { lt: days(RETENTION.inactiveCustomersMonths * 31) } } }),
    db.dataRequest.deleteMany({ where: { createdAt: { lt: days(RETENTION.dataRequestsYears * 366) } } }),
    db.dataRequest.deleteMany({ where: { status: "UNVERIFIED", createdAt: { lt: days(7) } } }),
    db.job.deleteMany({ where: { status: "DONE", updatedAt: { lt: days(RETENTION.jobsDoneDays) } } }),
    db.job.deleteMany({ where: { status: "FAILED", updatedAt: { lt: days(RETENTION.jobsFailedDays) } } }),
    db.review.deleteMany({ where: { status: { not: "APPROVED" }, isDemo: false, createdAt: { lt: days(RETENTION.unpublishedReviewsMonths * 31) } } }),
    db.stripeEvent.deleteMany({ where: { processedAt: { lt: days(RETENTION.stripeEventsDays) } } }),
    // El trigger de la BD solo permite borrar auditoría de más de 2 años
    db.auditLog.deleteMany({ where: { createdAt: { lt: days(RETENTION.auditYears * 366) } } }),
  ]);
  ["quotes", "carts", "loginAttempts", "sessions", "inactiveCustomers", "dataRequests", "unverifiedRequests", "jobs", "failedJobs", "unpublishedReviews", "stripeEvents", "auditLog"].forEach((k, i) => (report[k] = r[i].count));
  return report;
}
