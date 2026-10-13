import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailHash } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { secureToken } from "@/lib/ids";
import { emailSchema } from "@/lib/validation";
import { limitByIp } from "@/lib/rate-limit";

const schema = z.object({
  email: emailSchema,
  name: z.string().trim().max(80).optional(),
  consent: z.literal(true),
  lines: z.array(z.record(z.string(), z.unknown())).min(1).max(30),
});

/**
 * Guarda el carrito para enviar UN recordatorio si el pedido no se completa.
 * Solo con el consentimiento expreso del cliente (casilla sin marcar por defecto).
 */
export async function POST(request: Request) {
  if (!(await limitByIp("remember", 10, 10 * 60_000))) return NextResponse.json({ ok: false }, { status: 429 });
  const settings = await getSettings();
  if (!settings.marketing.abandonedCartEnabled) return NextResponse.json({ ok: false });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { email, name, lines } = parsed.data;
  const cart = JSON.stringify(lines);
  if (cart.length > 60_000) return NextResponse.json({ ok: false }, { status: 413 });
  await db.abandonedCart.upsert({
    where: { emailHash: emailHash(email) },
    create: { email, emailHash: emailHash(email), name, token: secureToken(), cart, consentAt: new Date() },
    update: { name, cart, consentAt: new Date(), emailSentAt: null, recoveredAt: null },
  });
  return NextResponse.json({ ok: true });
}

/** Retira el consentimiento (al desmarcar la casilla). */
export async function DELETE(request: Request) {
  if (!(await limitByIp("remember", 10, 10 * 60_000))) return NextResponse.json({ ok: false }, { status: 429 });
  const email = new URL(request.url).searchParams.get("email")?.toLowerCase().trim();
  if (email) await db.abandonedCart.deleteMany({ where: { emailHash: emailHash(email), recoveredAt: null } });
  return NextResponse.json({ ok: true });
}
