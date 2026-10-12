import { NextResponse } from "next/server";
import { CheckoutError, createOrder } from "@/lib/checkout";
import { createOrderSchema, firstError } from "@/lib/validation";
import { limitByIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!(await limitByIp("orders", 8, 10 * 60_000))) {
    return NextResponse.json({ error: "Has hecho demasiados intentos. Espera unos minutos o llámanos." }, { status: 429 });
  }
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });

  try {
    const result = await createOrder(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[orders] Error al crear el pedido", error);
    return NextResponse.json({ error: "No hemos podido registrar el pedido. Inténtalo de nuevo o llámanos." }, { status: 500 });
  }
}
