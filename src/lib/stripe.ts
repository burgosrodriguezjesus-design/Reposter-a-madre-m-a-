import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Cliente de Stripe, o null si no hay claves (entonces solo se ofrece pago en tienda). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: "Reposteria web" } });
  return client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
