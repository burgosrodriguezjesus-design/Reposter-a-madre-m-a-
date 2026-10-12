import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { giftCardEmails, loyaltyRewardEmail, newOrderAdminEmail, orderReceivedEmail, orderStatusEmail } from "@/lib/emails";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { formatLocalDate, formatPrice } from "@/lib/format";
import { NEXT_STATUSES } from "@/lib/order-status";
import { randomCode, secureToken } from "@/lib/ids";
import { getStripe } from "@/lib/stripe";

function adminRecipient(settings: Awaited<ReturnType<typeof getSettings>>) {
  return settings.notifications.adminEmail || settings.business.email;
}

/** Pedido confirmado (pagado o con pago en tienda): cliente, avisos y correos. */
export async function onOrderConfirmed(orderId: string) {
  const settings = await getSettings();
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;

  // Ficha de cliente (para fidelización y recordatorios)
  const customer = await db.customer.upsert({
    where: { email: order.customerEmail },
    create: {
      email: order.customerEmail,
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
  await db.order.update({ where: { id: order.id }, data: { customerId: customer.id } });
  if (order.quoteRequestId) {
    await db.quoteRequest.update({ where: { id: order.quoteRequestId }, data: { status: "ACCEPTED" } });
  }
  await db.abandonedCart.updateMany({
    where: { email: order.customerEmail, recoveredAt: null },
    data: { recoveredAt: new Date() },
  });

  await sendEmail(orderReceivedEmail(order, settings));
  const adminEmail = adminRecipient(settings);
  if (adminEmail) await sendEmail(newOrderAdminEmail(order, settings, adminEmail));

  if (settings.notifications.whatsappNotifyAdmin && settings.notifications.adminWhatsapp) {
    await sendWhatsAppTemplate(settings.notifications.adminWhatsapp, process.env.WHATSAPP_TEMPLATE_NEW_ORDER ?? "", [
      `${order.number} · ${order.customerName} · ${formatLocalDate(order.scheduledDate, "short")} ${order.scheduledTime} · ${formatPrice(order.totalCents)}`,
    ]);
  }
}

/** Pago confirmado por Stripe (webhook o comprobación al volver del pago). Idempotente. */
export async function markOrderPaid(orderId: string, paymentIntentId: string | null) {
  const settings = await getSettings();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus === "PAID") return;

  const next: OrderStatus =
    order.quoteRequestId || (settings.ordering.autoAcceptStandardOrders && !order.requiresReview) ? "ACCEPTED" : "PENDING";

  const updated = await db.order.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT", paymentStatus: { not: "PAID" } },
    data: { status: next, paymentStatus: "PAID", stripePaymentIntentId: paymentIntentId },
  });
  if (updated.count === 1) {
    await db.orderStatusEvent.create({ data: { orderId, status: next, note: "Pago online recibido" } });
    await onOrderConfirmed(orderId);
    return;
  }
  // El pago llegó después de que caducara la reserva: lo registramos para revisión manual.
  await db.order.update({
    where: { id: orderId },
    data: {
      status: "PENDING",
      paymentStatus: "PAID",
      stripePaymentIntentId: paymentIntentId,
      adminNotes: `${order.adminNotes ?? ""}\n⚠️ Pago recibido después de caducar la reserva: revisa disponibilidad y descuentos.`.trim(),
      history: { create: { status: "PENDING", note: "Pago recibido tras caducar la reserva" } },
    },
  });
  await onOrderConfirmed(orderId);
}

export async function expireUnpaidOrder(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING_PAYMENT") return;
  await releaseOrderHolds(orderId, "CANCELLED", "Pago no completado");
}

/** Cambio de estado desde el panel, con aviso al cliente. */
export async function changeOrderStatus(
  orderId: string,
  status: OrderStatus,
  options: { note?: string | null; notifyCustomer?: boolean; refund?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await getSettings();
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { ok: false, error: "Pedido no encontrado" };
  if (!NEXT_STATUSES[order.status].includes(status)) {
    return { ok: false, error: "Ese cambio de estado no está permitido" };
  }

  if (status === "REJECTED" || status === "CANCELLED") {
    let refundNote = "";
    if (options.refund && order.paymentStatus === "PAID" && order.stripePaymentIntentId) {
      const stripe = getStripe();
      if (!stripe) return { ok: false, error: "Stripe no está configurado para reembolsar" };
      try {
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
        await db.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED" } });
        refundNote = " · Importe reembolsado";
      } catch (error) {
        console.error("[stripe] Reembolso fallido", error);
        return { ok: false, error: "No se pudo hacer el reembolso en Stripe. Revísalo en tu panel de Stripe" };
      }
    }
    await releaseOrderHolds(orderId, status, `${options.note || (status === "REJECTED" ? "Rechazado" : "Cancelado")}${refundNote}`);
    if (status === "REJECTED" && options.note) {
      await db.order.update({ where: { id: orderId }, data: { rejectionReason: options.note } });
    }
  } else {
    const paidOnDelivery = status === "DELIVERED" && order.paymentMethod === "IN_STORE" && order.paymentStatus === "UNPAID";
    await db.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(paidOnDelivery ? { paymentStatus: "PAID" } : {}),
        history: { create: { status, note: options.note || null } },
      },
    });
    if (status === "DELIVERED") await awardLoyalty(orderId);
  }

  if (options.notifyCustomer !== false) {
    const fresh = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (fresh) await sendEmail(orderStatusEmail(fresh, settings, status, options.note));
  }
  return { ok: true };
}

/** Programa de fidelización: sellos por importe gastado; al completar la tarjeta se envía un cupón. */
async function awardLoyalty(orderId: string) {
  const settings = await getSettings();
  const m = settings.marketing;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !order.customerId || order.loyaltyAwarded) return;

  const spent = Math.max(0, order.subtotalCents - order.discountCents);
  const customer = await db.customer.update({
    where: { id: order.customerId },
    data: { ordersCount: { increment: 1 }, totalSpentCents: { increment: order.totalCents + order.giftCardCents } },
  });
  await db.order.update({ where: { id: orderId }, data: { loyaltyAwarded: true } });
  if (!m.loyaltyEnabled || m.loyaltyStampEveryCents <= 0 || m.loyaltyStampsForReward <= 0) return;

  let stamps = customer.loyaltyStamps + Math.floor(spent / m.loyaltyStampEveryCents);
  while (stamps >= m.loyaltyStampsForReward) {
    stamps -= m.loyaltyStampsForReward;
    const code = `GRACIAS-${randomCode(5)}`;
    await db.coupon.create({
      data: {
        code,
        description: `Premio de fidelización para ${customer.email}`,
        type: "FIXED",
        value: m.loyaltyRewardCents,
        maxRedemptions: 1,
        endsAt: new Date(Date.now() + 180 * 86_400_000),
      },
    });
    await sendEmail(loyaltyRewardEmail({ name: customer.name, email: customer.email, code, amountCents: m.loyaltyRewardCents }, settings));
  }
  await db.customer.update({ where: { id: customer.id }, data: { loyaltyStamps: stamps } });
}

export async function activateGiftCard(giftCardId: string, paymentMethod: "CARD" | "IN_STORE") {
  const settings = await getSettings();
  const updated = await db.giftCard.updateMany({
    where: { id: giftCardId, status: "PENDING_PAYMENT" },
    data: {
      status: "ACTIVE",
      paymentMethod,
      expiresAt: new Date(Date.now() + settings.marketing.giftCardValidityMonths * 30.5 * 86_400_000),
    },
  });
  if (updated.count === 0) return;
  const card = await db.giftCard.findUnique({ where: { id: giftCardId } });
  if (card) for (const message of giftCardEmails(card, settings)) await sendEmail(message);
}

/** Devuelve el saldo de tarjeta regalo y el uso del cupón de un pedido que no sigue adelante. */
export async function releaseOrderHolds(orderId: string, status: "CANCELLED" | "REJECTED", note: string) {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status === "CANCELLED" || order.status === "REJECTED") return;
    if (order.giftCardId && order.giftCardCents > 0) {
      await tx.giftCard.update({
        where: { id: order.giftCardId },
        data: { balanceCents: { increment: order.giftCardCents }, status: "ACTIVE" },
      });
    }
    if (order.couponCode) {
      await tx.coupon.updateMany({
        where: { code: order.couponCode, redemptions: { gt: 0 } },
        data: { redemptions: { decrement: 1 } },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status, giftCardCents: 0, history: { create: { status, note } } },
    });
  });
}
