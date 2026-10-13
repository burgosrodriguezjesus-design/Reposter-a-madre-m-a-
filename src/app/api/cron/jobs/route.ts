import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isCronAuthorized } from "@/lib/http";
import { runJobs } from "@/lib/job-handlers";
import { getStripe, paymentFromSession } from "@/lib/stripe";
import { expireUnpaidOrder, markOrderPaid } from "@/lib/order-events";
import { log } from "@/lib/logger";

/**
 * Tarea frecuente (cada minuto): procesa la cola de trabajos (emails, avisos, alertas) con
 * reintentos y concilia los pagos pendientes con Stripe por si algún webhook no llegó.
 * Requiere "Authorization: Bearer CRON_SECRET".
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Conciliación: pedidos pendientes de pago desde hace más de 40 minutos
  const reconciled = { paid: 0, expired: 0 };
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - 40 * 60_000) } },
    select: { id: true, stripeSessionId: true },
    take: 50,
  });
  const stripe = getStripe();
  for (const order of stale) {
    try {
      if (stripe && order.stripeSessionId) {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        if (session.payment_status === "paid") {
          await markOrderPaid(order.id, paymentFromSession(session));
          reconciled.paid++;
          continue;
        }
        if (session.status === "open") continue; // aún puede pagarse
      }
      await expireUnpaidOrder(order.id);
      reconciled.expired++;
    } catch (error) {
      log.warn("cron.reconcile_failed", { orderId: order.id, error });
    }
  }
  await db.giftCard.updateMany({
    where: { status: "PENDING_PAYMENT", paymentMethod: "CARD", createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
    data: { status: "CANCELLED" },
  });

  const jobs = await runJobs({ limit: 20, timeBudgetMs: 40_000 });
  return NextResponse.json({ ok: true, reconciled, jobs }, { headers: { "Cache-Control": "no-store" } });
}
