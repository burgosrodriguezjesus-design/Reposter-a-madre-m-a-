import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isLiveKey, paymentFromSession } from "@/lib/stripe";
import { activateGiftCard, expireUnpaidOrder, markOrderPaid, markOrderRefunded, markPaymentFailed } from "@/lib/order-events";
import { db } from "@/lib/db";
import { kickJobs } from "@/lib/job-handlers";
import { securityAlert } from "@/lib/alerts";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

/**
 * Webhook de Stripe. Configúralo en Stripe → Desarrolladores → Webhooks con la URL
 * https://TU-DOMINIO/api/stripe/webhook y los eventos:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
 *
 * Seguridad e integridad:
 *  - Firma verificada sobre el cuerpo SIN modificar (STRIPE_WEBHOOK_SECRET) y tolerancia de 5 min.
 *  - Cada evento se procesa una sola vez (tabla StripeEvent) y todas las operaciones son
 *    idempotentes, así que los reintentos de Stripe nunca duplican pagos ni correos.
 *  - Si algo falla se responde 500 y Stripe reintenta durante días: ningún pago se pierde.
 */
export const maxDuration = 30;

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe no configurado" }, { status: 501 });

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature || body.length > 512_000) return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret, 300);
  } catch {
    inc("webhook_events_total", { type: "unknown", result: "invalid_signature" });
    await securityAlert("webhook.invalid_signature", "Llamada al webhook de Stripe con firma no válida.", {}, { dedupe: "sig" });
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  // Eventos de prueba en producción (o al revés): se ignoran
  if (event.livemode !== isLiveKey()) {
    inc("webhook_events_total", { type: event.type, result: "ignored_mode" });
    return NextResponse.json({ received: true, ignored: "mode" });
  }

  const seen = await db.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } });
  if (seen) {
    inc("webhook_events_total", { type: event.type, result: "duplicate" });
    return NextResponse.json({ received: true, duplicate: true });
  }

  let result = "ignored";
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status !== "paid") {
          result = "awaiting_payment"; // p. ej. pago SEPA pendiente: llegará async_payment_*
          break;
        }
        if (session.metadata?.type === "order" && session.metadata.orderId) {
          result = await markOrderPaid(session.metadata.orderId, paymentFromSession(session));
        } else if (session.metadata?.type === "giftcard" && session.metadata.giftCardId) {
          await activateGiftCard(session.metadata.giftCardId, "CARD", session.amount_total);
          result = "giftcard_activated";
        }
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        if (session.metadata?.type === "order" && session.metadata.orderId) {
          await markPaymentFailed(session.metadata.orderId, "async_payment_failed");
          result = "payment_failed";
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        if (session.metadata?.type === "order" && session.metadata.orderId) {
          await expireUnpaidOrder(session.metadata.orderId);
          result = "expired";
        } else if (session.metadata?.type === "giftcard" && session.metadata.giftCardId) {
          await db.giftCard.updateMany({ where: { id: session.metadata.giftCardId, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
          result = "giftcard_cancelled";
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) await markOrderRefunded(pi, charge.refunded);
        result = "refund_recorded";
        break;
      }
    }
    await db.stripeEvent.upsert({ where: { id: event.id }, create: { id: event.id, type: event.type, result }, update: {} });
  } catch (error) {
    inc("webhook_events_total", { type: event.type, result: "error" });
    log.error("stripe.webhook_error", { type: event.type, eventId: event.id, error });
    // 500 → Stripe reintentará el evento
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  inc("webhook_events_total", { type: event.type, result });
  kickJobs();
  return NextResponse.json({ received: true });
}
