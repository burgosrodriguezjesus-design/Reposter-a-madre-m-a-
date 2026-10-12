import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { enqueue } from "@/lib/jobs";
import { NEXT_STATUSES } from "@/lib/order-status";
import { secureToken } from "@/lib/ids";
import { getStripe } from "@/lib/stripe";
import { securityAlert } from "@/lib/alerts";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

/**
 * Ciclo de vida de los pedidos con garantías de integridad:
 * - Cada transición de estado es una actualización condicional (estado esperado → nuevo): dos
 *   cambios simultáneos nunca se pisan.
 * - Los efectos (emails, WhatsApp, ficha de cliente) se encolan en la MISMA transacción
 *   (patrón outbox): un pedido confirmado nunca se queda sin aviso por un fallo silencioso.
 * - Las reservas (stock, saldo de tarjeta regalo, usos de cupón) se devuelven una sola vez.
 */
export type Actor = { id: string; email: string } | null;

/** Bloquea la fila del pedido hasta el final de la transacción. */
async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
}

/** Encola los efectos de un pedido confirmado (idempotente gracias a la clave de deduplicación). */
export async function enqueueOrderConfirmed(tx: Tx, orderId: string) {
  await enqueue("order.confirmed", { orderId }, { tx, dedupeKey: `order.confirmed:${orderId}` });
}

/**
 * Efectos de un pedido confirmado (lo ejecuta la cola; se puede repetir sin duplicar nada):
 * ficha de cliente, presupuesto aceptado, carrito recuperado y avisos.
 */
export async function handleOrderConfirmed(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const settings = await getSettings();

  if (!order.customerId && !order.anonymizedAt) {
    const customer = await db.customer.upsert({
      where: { emailHash: order.customerEmailHash },
      create: {
        email: order.customerEmail,
        emailHash: order.customerEmailHash,
        name: order.customerName,
        phone: order.customerPhone,
        unsubscribeToken: secureToken(),
        marketingConsent: order.marketingConsent,
        marketingConsentAt: order.marketingConsent ? new Date() : null,
      },
      update: {
        name: order.customerName,
        phone: order.customerPhone,
        ...(order.marketingConsent ? { marketingConsent: true, marketingConsentAt: new Date() } : {}),
      },
    });
    await db.order.updateMany({ where: { id: order.id, customerId: null }, data: { customerId: customer.id } });
  }
  if (order.quoteRequestId) {
    await db.quoteRequest.updateMany({ where: { id: order.quoteRequestId, status: { not: "ACCEPTED" } }, data: { status: "ACCEPTED" } });
  }
  await db.abandonedCart.updateMany({ where: { emailHash: order.customerEmailHash, recoveredAt: null }, data: { recoveredAt: new Date() } });

  await enqueue("email.send", { template: "order-received", orderId }, { dedupeKey: `email:order-received:${orderId}` });
  if (settings.notifications.adminEmail || settings.business.email) {
    await enqueue("email.send", { template: "order-admin", orderId }, { dedupeKey: `email:order-admin:${orderId}` });
  }
  if (settings.notifications.whatsappNotifyAdmin && settings.notifications.adminWhatsapp) {
    await enqueue("whatsapp.new-order", { orderId }, { dedupeKey: `whatsapp:new-order:${orderId}` });
  }
}

type StripePayment = { paymentIntentId: string | null; amountTotal: number | null; currency: string | null };

/**
 * Pago confirmado por Stripe (webhook firmado o comprobación al volver del pago). Idempotente.
 * El importe cobrado se compara con el total calculado en el servidor.
 */
export async function markOrderPaid(orderId: string, payment: StripePayment) {
  const settings = await getSettings();
  const result = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return "missing" as const;
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") return "already" as const;

    const amountOk = payment.amountTotal === order.totalCents && (payment.currency ?? "eur").toLowerCase() === "eur";
    if (!amountOk) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: order.status === "PENDING_PAYMENT" ? "PENDING" : order.status,
          paymentStatus: "PAID",
          stripePaymentIntentId: payment.paymentIntentId,
          requiresReview: true,
          adminNotes: `${order.adminNotes ?? ""}\n⚠️ El importe cobrado por Stripe no coincide con el total del pedido: revísalo antes de prepararlo.`.trim(),
          history: { create: { status: order.status === "PENDING_PAYMENT" ? "PENDING" : order.status, note: "Pago con importe distinto al esperado" } },
        },
      });
      return "mismatch" as const;
    }

    if (order.status === "PENDING_PAYMENT") {
      const next: OrderStatus =
        order.quoteRequestId || (settings.ordering.autoAcceptStandardOrders && !order.requiresReview) ? "ACCEPTED" : "PENDING";
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: next,
          paymentStatus: "PAID",
          stripePaymentIntentId: payment.paymentIntentId,
          history: { create: { status: next, note: "Pago online recibido" } },
        },
      });
      await enqueueOrderConfirmed(tx, orderId);
      return "paid" as const;
    }

    // El pago llegó después de que caducara la reserva: se registra para revisión manual.
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PENDING",
        paymentStatus: "PAID",
        stripePaymentIntentId: payment.paymentIntentId,
        requiresReview: true,
        adminNotes: `${order.adminNotes ?? ""}\n⚠️ Pago recibido después de caducar la reserva: revisa disponibilidad y descuentos.`.trim(),
        history: { create: { status: "PENDING", note: "Pago recibido tras caducar la reserva" } },
      },
    });
    await enqueueOrderConfirmed(tx, orderId);
    return "late" as const;
  });

  if (result === "paid" || result === "late") inc("payments_succeeded_total");
  if (result === "mismatch") {
    inc("payments_failed_total", { reason: "amount_mismatch" });
    await securityAlert("payment.amount_mismatch", "Un pago de Stripe no coincide con el total del pedido.", { orderId }, { severity: "critical" });
  }
  if (result === "late") await securityAlert("payment.late", "Se ha recibido el pago de un pedido cuya reserva había caducado.", { orderId });
  return result;
}

/** Pago fallido o rechazado (p. ej. transferencia SEPA que no se completa). */
export async function markPaymentFailed(orderId: string, reason: string) {
  inc("payments_failed_total", { reason: "declined" });
  const released = await releaseOrderHolds(orderId, "CANCELLED", `Pago no completado (${reason})`, { onlyFrom: ["PENDING_PAYMENT"], paymentStatus: "FAILED" });
  if (released) await securityAlert("payment.failed", "Un pago online no se ha completado.", { orderId, reason }, { dedupe: "declined" });
}

export async function expireUnpaidOrder(orderId: string) {
  await releaseOrderHolds(orderId, "CANCELLED", "Pago no completado", { onlyFrom: ["PENDING_PAYMENT"] });
}

/** Reembolso hecho desde el panel de Stripe: se refleja en el pedido. */
export async function markOrderRefunded(paymentIntentId: string, fully: boolean) {
  const order = await db.order.findFirst({ where: { stripePaymentIntentId: paymentIntentId }, select: { id: true, status: true, paymentStatus: true } });
  if (!order || !fully || order.paymentStatus === "REFUNDED") return;
  await db.order.update({
    where: { id: order.id },
    data: { paymentStatus: "REFUNDED", history: { create: { status: order.status, note: "Reembolso registrado en Stripe" } } },
  });
}

/** Cambio de estado desde el panel, con aviso al cliente. */
export async function changeOrderStatus(
  orderId: string,
  status: OrderStatus,
  options: { note?: string | null; notifyCustomer?: boolean; refund?: boolean; actor?: Actor } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentStatus: true, paymentMethod: true, stripePaymentIntentId: true },
  });
  if (!order) return { ok: false, error: "Pedido no encontrado" };
  if (!NEXT_STATUSES[order.status].includes(status)) return { ok: false, error: "Ese cambio de estado no está permitido" };
  const actor = { actorId: options.actor?.id ?? null, actorEmail: options.actor?.email ?? null };

  if (status === "REJECTED" || status === "CANCELLED") {
    let refundNote = "";
    if (options.refund && order.paymentStatus === "PAID" && order.stripePaymentIntentId) {
      const stripe = getStripe();
      if (!stripe) return { ok: false, error: "Stripe no está configurado para reembolsar" };
      try {
        // Clave de idempotencia: un doble clic o un reintento nunca reembolsa dos veces
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId }, { idempotencyKey: `refund-${orderId}` });
        await db.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED" } });
        refundNote = " · Importe reembolsado";
      } catch (error) {
        log.error("stripe.refund_failed", { orderId, error });
        return { ok: false, error: "No se pudo hacer el reembolso en Stripe. Revísalo en tu panel de Stripe" };
      }
    }
    const done = await releaseOrderHolds(orderId, status, `${options.note || (status === "REJECTED" ? "Rechazado" : "Cancelado")}${refundNote}`, {
      onlyFrom: [order.status],
      actor: options.actor ?? null,
      rejectionReason: status === "REJECTED" ? options.note || null : null,
    });
    if (!done) return { ok: false, error: "El pedido ha cambiado mientras tanto. Recarga la página." };
  } else {
    const paidOnDelivery = status === "DELIVERED" && order.paymentMethod === "IN_STORE" && order.paymentStatus === "UNPAID";
    const changed = await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status, ...(paidOnDelivery ? { paymentStatus: "PAID" } : {}) },
      });
      if (count === 0) return false;
      await tx.orderStatusEvent.create({ data: { orderId, status, note: options.note || null, ...actor } });
      if (status === "DELIVERED") await enqueue("order.loyalty", { orderId }, { tx, dedupeKey: `order.loyalty:${orderId}` });
      return true;
    });
    if (!changed) return { ok: false, error: "El pedido ha cambiado mientras tanto. Recarga la página." };
  }

  if (options.notifyCustomer !== false) {
    await enqueue("email.send", { template: "order-status", orderId, status, note: options.note ?? null }, { dedupeKey: `email:order-status:${orderId}:${status}` });
  }
  return { ok: true };
}

/** Programa de fidelización (lo ejecuta la cola al entregar un pedido). Idempotente. */
export async function awardLoyalty(orderId: string) {
  const settings = await getSettings();
  const m = settings.marketing;
  const rewards = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || !order.customerId || order.loyaltyAwarded) return [];
    await tx.order.update({ where: { id: orderId }, data: { loyaltyAwarded: true } });
    const customer = await tx.customer.update({
      where: { id: order.customerId },
      data: { ordersCount: { increment: 1 }, totalSpentCents: { increment: order.totalCents + order.giftCardCents } },
    });
    if (!m.loyaltyEnabled || m.loyaltyStampEveryCents <= 0 || m.loyaltyStampsForReward <= 0) return [];
    const spent = Math.max(0, order.subtotalCents - order.discountCents);
    let stamps = customer.loyaltyStamps + Math.floor(spent / m.loyaltyStampEveryCents);
    const codes: string[] = [];
    while (stamps >= m.loyaltyStampsForReward && codes.length < 5) {
      stamps -= m.loyaltyStampsForReward;
      const code = `GRACIAS-${secureToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()}`;
      await tx.coupon.create({
        data: {
          code,
          description: `Premio de fidelización (cliente ${customer.id})`,
          type: "FIXED",
          value: m.loyaltyRewardCents,
          maxRedemptions: 1,
          endsAt: new Date(Date.now() + 180 * 86_400_000),
        },
      });
      codes.push(code);
    }
    await tx.customer.update({ where: { id: customer.id }, data: { loyaltyStamps: stamps } });
    for (const code of codes) {
      await enqueue("email.send", { template: "loyalty", customerId: customer.id, code, amountCents: m.loyaltyRewardCents }, { tx, dedupeKey: `email:loyalty:${code}` });
    }
    return codes;
  });
  return rewards.length;
}

export async function activateGiftCard(giftCardId: string, paymentMethod: "CARD" | "IN_STORE", amountTotal?: number | null) {
  const settings = await getSettings();
  await db.$transaction(async (tx) => {
    const card = await tx.giftCard.findUnique({ where: { id: giftCardId }, select: { initialCents: true, status: true } });
    if (!card || card.status !== "PENDING_PAYMENT") return;
    if (paymentMethod === "CARD" && amountTotal !== undefined && amountTotal !== card.initialCents) {
      await securityAlert("payment.amount_mismatch", "El pago de una tarjeta regalo no coincide con su importe.", { giftCardId }, { severity: "critical" });
      return;
    }
    const { count } = await tx.giftCard.updateMany({
      where: { id: giftCardId, status: "PENDING_PAYMENT" },
      data: { status: "ACTIVE", paymentMethod, expiresAt: new Date(Date.now() + settings.marketing.giftCardValidityMonths * 30.5 * 86_400_000) },
    });
    if (count === 1) await enqueue("email.send", { template: "giftcard", giftCardId }, { tx, dedupeKey: `email:giftcard:${giftCardId}` });
  });
}

/**
 * Cancela o rechaza un pedido y devuelve, UNA sola vez, lo que tenía reservado:
 * unidades de stock, saldo de tarjeta regalo y uso del cupón.
 */
export async function releaseOrderHolds(
  orderId: string,
  status: "CANCELLED" | "REJECTED",
  note: string,
  opts: { onlyFrom?: OrderStatus[]; actor?: Actor; paymentStatus?: "FAILED"; rejectionReason?: string | null } = {},
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { select: { productId: true, quantity: true } } } });
    if (!order || order.status === "CANCELLED" || order.status === "REJECTED") return false;
    if (opts.onlyFrom && !opts.onlyFrom.includes(order.status)) return false;
    if (order.giftCardId && order.giftCardCents > 0) {
      await tx.giftCard.update({ where: { id: order.giftCardId }, data: { balanceCents: { increment: order.giftCardCents }, status: "ACTIVE" } });
    }
    if (order.couponCode) {
      await tx.coupon.updateMany({ where: { code: order.couponCode, redemptions: { gt: 0 } }, data: { redemptions: { decrement: 1 } } });
    }
    for (const item of order.items) {
      if (item.productId) await tx.product.updateMany({ where: { id: item.productId, stock: { not: null } }, data: { stock: { increment: item.quantity } } });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        status,
        giftCardCents: 0,
        ...(opts.paymentStatus ? { paymentStatus: opts.paymentStatus } : {}),
        ...(opts.rejectionReason ? { rejectionReason: opts.rejectionReason } : {}),
        history: { create: { status, note, actorId: opts.actor?.id ?? null, actorEmail: opts.actor?.email ?? null } },
      },
    });
    return true;
  });
}
