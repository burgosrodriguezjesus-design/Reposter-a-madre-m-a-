import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStripe } from "@/lib/stripe";
import { expireUnpaidOrder, markOrderPaid } from "@/lib/order-events";
import { sendEmail } from "@/lib/email";
import { abandonedCartEmail, reminderEmail } from "@/lib/emails";
import { addDays, localNow } from "@/lib/availability";
import { formatLocalDate } from "@/lib/format";

/**
 * Tareas programadas (idempotentes). Vercel Cron la llama con
 * "Authorization: Bearer CRON_SECRET". Recomendado: cada hora (o al menos a diario).
 *  1. Revisa pagos pendientes caducados.
 *  2. Envía UN recordatorio de carrito a quien lo autorizó.
 *  3. Envía los recordatorios de celebraciones.
 *  4. Limpia datos antiguos (minimización de datos, RGPD).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const settings = await getSettings();
  const report = { expiredOrders: 0, paidOrders: 0, cartEmails: 0, reminders: 0 };

  // 1. Pedidos pendientes de pago desde hace más de 40 minutos
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - 40 * 60_000) } },
    take: 100,
  });
  const stripe = getStripe();
  for (const order of stale) {
    let paid = false;
    if (stripe && order.stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        if (session.payment_status === "paid") {
          await markOrderPaid(order.id, typeof session.payment_intent === "string" ? session.payment_intent : null);
          paid = true;
          report.paidOrders++;
        }
      } catch (error) {
        console.error("[cron] Stripe", error);
        continue;
      }
    }
    if (!paid) {
      await expireUnpaidOrder(order.id);
      report.expiredOrders++;
    }
  }
  await db.giftCard.updateMany({
    where: { status: "PENDING_PAYMENT", paymentMethod: "CARD", createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
    data: { status: "CANCELLED" },
  });

  // 2. Recordatorio de carrito (una sola vez, solo con consentimiento)
  if (settings.marketing.abandonedCartEnabled) {
    const carts = await db.abandonedCart.findMany({
      where: {
        recoveredAt: null,
        emailSentAt: null,
        updatedAt: {
          lt: new Date(Date.now() - settings.marketing.abandonedCartDelayHours * 3600_000),
          gt: new Date(Date.now() - 7 * 86_400_000),
        },
      },
      take: 100,
    });
    for (const cart of carts) {
      const recentOrder = await db.order.findFirst({
        where: { customerEmail: cart.email, createdAt: { gte: cart.updatedAt }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } },
      });
      if (recentOrder) {
        await db.abandonedCart.update({ where: { id: cart.id }, data: { recoveredAt: new Date() } });
        continue;
      }
      const customer = await db.customer.findUnique({ where: { email: cart.email } });
      await sendEmail(
        abandonedCartEmail(
          { name: cart.name, email: cart.email, token: cart.token, unsubscribeToken: customer?.unsubscribeToken ?? `c-${cart.token}` },
          settings,
        ),
      );
      await db.abandonedCart.update({ where: { id: cart.id }, data: { emailSentAt: new Date() } });
      report.cartEmails++;
    }
  }

  // 3. Recordatorios de celebraciones
  if (settings.marketing.remindersEnabled) {
    const today = localNow(settings.business.timezone).date;
    const target = addDays(today, settings.marketing.reminderDaysBefore);
    const [year, month, day] = target.split("-").map(Number);
    const reminders = await db.celebrationReminder.findMany({
      where: { active: true, month, day, OR: [{ lastSentYear: null }, { lastSentYear: { lt: year } }] },
      include: { customer: true },
      take: 500,
    });
    for (const r of reminders) {
      await sendEmail(
        reminderEmail(
          { name: r.customer.name, email: r.customer.email, label: r.label, date: formatLocalDate(target), unsubscribeToken: r.customer.unsubscribeToken },
          settings,
        ),
      );
      await db.celebrationReminder.update({ where: { id: r.id }, data: { lastSentYear: year } });
      report.reminders++;
    }
  }

  // 4. Limpieza
  await db.abandonedCart.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });

  return NextResponse.json({ ok: true, ...report });
}
