import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { CheckoutError, createOrder } from "@/lib/checkout";
import { limitByIp } from "@/lib/rate-limit";
import { firstError } from "@/lib/validation";

const schema = z.object({
  token: z.string().min(10).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elige una hora"),
  paymentMethod: z.enum(["CARD", "IN_STORE"]),
  postalCode: z.string().trim().max(10).optional(),
  address: z.object({ street: z.string().trim().max(200), city: z.string().trim().max(80), details: z.string().trim().max(300).optional() }).optional(),
  acceptTerms: z.literal(true, { error: "Debes aceptar las condiciones de compra" }),
});

/** El cliente acepta el presupuesto: se crea el pedido al precio acordado. */
export async function POST(request: Request, { params }: RouteContext<"/api/quotes/[id]/accept">) {
  if (!(await limitByIp("quote-accept", 10, 10 * 60_000))) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  const input = parsed.data;

  const quote = await db.quoteRequest.findUnique({ where: { id }, include: { order: true } });
  if (!quote || quote.accessToken !== input.token) return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
  if (quote.status !== "QUOTED") return NextResponse.json({ error: "Este presupuesto ya no se puede aceptar" }, { status: 409 });
  if (quote.order) {
    if (quote.order.status !== "CANCELLED") {
      return NextResponse.json({ error: "Ya existe un pedido para este presupuesto", redirectUrl: `/pedido/${quote.order.number}?t=${quote.order.accessToken}` }, { status: 409 });
    }
    // Un intento anterior de pago que no se completó: se desvincula para poder reintentar
    await db.order.update({ where: { id: quote.order.id }, data: { quoteRequestId: null } });
  }

  try {
    const result = await createOrder(
      {
        items: [{ kind: "custom", quantity: 1 }],
        fulfillment: quote.fulfillment,
        postalCode: input.postalCode,
        date: input.date,
        time: input.time,
        customer: { name: quote.customerName, email: quote.customerEmail, phone: quote.customerPhone },
        address: input.address,
        notes: quote.notes ?? undefined,
        paymentMethod: input.paymentMethod,
        acceptTerms: true,
        marketingConsent: false,
      },
      quote,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[quotes] Error al aceptar", error);
    return NextResponse.json({ error: "No se pudo confirmar. Inténtalo de nuevo o llámanos." }, { status: 500 });
  }
}
