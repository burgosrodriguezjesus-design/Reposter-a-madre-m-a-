import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Cliente de Stripe, o null si no hay claves (entonces solo se ofrece pago en tienda). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: "Reposteria web" }, maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Datos del pago de una sesión de Checkout que se contrastan con el pedido. */
export function paymentFromSession(session: Stripe.Checkout.Session) {
  return {
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
    amountTotal: session.amount_total,
    currency: session.currency,
  };
}

/** ¿La clave es de producción? Los eventos de prueba se ignoran en producción y viceversa. */
export function isLiveKey(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") || (process.env.STRIPE_SECRET_KEY ?? "").startsWith("rk_live_");
}
