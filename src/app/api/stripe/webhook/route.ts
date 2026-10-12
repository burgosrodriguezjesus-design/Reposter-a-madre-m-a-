import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { activateGiftCard, expireUnpaidOrder, markOrderPaid } from "@/lib/order-events";
import { db } from "@/lib/db";

/**
 * Webhook de Stripe. Configúralo en Stripe → Desarrolladores → Webhooks con la URL
 * https://TU-DOMINIO/api/stripe/webhook y los eventos:
 *   checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe no configurado" }, { status: 501 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Falta la firma" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (error) {
    console.error("[stripe] Firma de webhook no válida", error);
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status !== "paid") break;
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
        if (session.metadata?.type === "order" && session.metadata.orderId) {
          await markOrderPaid(session.metadata.orderId, paymentIntent);
        } else if (session.metadata?.type === "giftcard" && session.metadata.giftCardId) {
          await activateGiftCard(session.metadata.giftCardId, "CARD");
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        if (session.metadata?.type === "order" && session.metadata.orderId) {
          await expireUnpaidOrder(session.metadata.orderId);
        } else if (session.metadata?.type === "giftcard" && session.metadata.giftCardId) {
          await db.giftCard.updateMany({
            where: { id: session.metadata.giftCardId, status: "PENDING_PAYMENT" },
            data: { status: "CANCELLED" },
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error("[stripe] Error procesando el evento", event.type, error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
