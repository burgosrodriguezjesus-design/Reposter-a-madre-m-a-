import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { giftCardPurchaseSchema, firstError } from "@/lib/validation";
import { limitByIp } from "@/lib/rate-limit";
import { giftCardCode } from "@/lib/ids";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { siteUrl } from "@/lib/site-url";
import { formatPrice } from "@/lib/format";
import { sendEmail } from "@/lib/email";

/** Compra de tarjeta regalo digital (pago online) o reserva para pagar en tienda. */
export async function POST(request: Request) {
  if (!(await limitByIp("giftcards", 6, 30 * 60_000))) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  const settings = await getSettings();
  if (!settings.marketing.giftCardsEnabled) return NextResponse.json({ error: "Las tarjetas regalo no están disponibles" }, { status: 400 });

  const parsed = giftCardPurchaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  const input = parsed.data;
  if (input.website) return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  if (!settings.marketing.giftCardAmounts.includes(input.amountCents)) {
    return NextResponse.json({ error: "Importe no disponible" }, { status: 400 });
  }
  if (input.paymentMethod === "CARD" && !isStripeConfigured()) {
    return NextResponse.json({ error: "El pago online no está disponible. Elige pagar en tienda." }, { status: 400 });
  }

  let card = null;
  for (let i = 0; i < 4 && !card; i++) {
    try {
      card = await db.giftCard.create({
        data: {
          code: giftCardCode(),
          initialCents: input.amountCents,
          balanceCents: input.amountCents,
          status: "PENDING_PAYMENT",
          purchaserName: input.purchaserName,
          purchaserEmail: input.purchaserEmail,
          recipientName: input.recipientName || null,
          recipientEmail: input.recipientEmail || null,
          message: input.message || null,
          paymentMethod: input.paymentMethod,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  if (!card) return NextResponse.json({ error: "Inténtalo de nuevo" }, { status: 500 });

  if (input.paymentMethod === "CARD") {
    const session = await getStripe()!.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      customer_email: input.purchaserEmail,
      metadata: { type: "giftcard", giftCardId: card.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: input.amountCents,
            product_data: { name: `Tarjeta regalo ${formatPrice(input.amountCents)} · ${settings.business.name}` },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: siteUrl("/tarjetas-regalo?ok=1"),
      cancel_url: siteUrl("/tarjetas-regalo?cancelado=1"),
    });
    await db.giftCard.update({ where: { id: card.id }, data: { stripeSessionId: session.id } });
    return NextResponse.json({ redirectUrl: session.url });
  }

  // Pago en tienda: se activa desde el panel al cobrarla
  const admin = settings.notifications.adminEmail || settings.business.email;
  if (admin) {
    await sendEmail({
      to: admin,
      subject: `Reserva de tarjeta regalo de ${formatPrice(input.amountCents)} (pago en tienda)`,
      html: `<p>${input.purchaserName} (${input.purchaserEmail}) ha reservado una tarjeta regalo de ${formatPrice(input.amountCents)}. Actívala en el panel cuando la cobres.</p><p><a href="${siteUrl("/admin/tarjetas-regalo")}">Abrir panel</a></p>`,
      text: `Reserva de tarjeta regalo de ${formatPrice(input.amountCents)} por ${input.purchaserName}. Actívala en el panel al cobrarla.`,
    });
  }
  return NextResponse.json({ reserved: true });
}
