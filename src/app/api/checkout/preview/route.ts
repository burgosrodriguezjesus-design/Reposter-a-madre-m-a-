import { NextResponse } from "next/server";
import { priceCart, toPreview } from "@/lib/checkout";
import { getSettings } from "@/lib/settings";
import { checkoutBaseSchema, firstError } from "@/lib/validation";
import { limitByIp } from "@/lib/rate-limit";

/** Calcula el pedido (precios reales, envío, cupón y tarjeta regalo) sin crearlo. */
export async function POST(request: Request) {
  if (!(await limitByIp("preview", 90, 60_000))) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  const parsed = checkoutBaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  const settings = await getSettings();
  const cart = await priceCart(parsed.data, settings);
  return NextResponse.json(toPreview(cart));
}
