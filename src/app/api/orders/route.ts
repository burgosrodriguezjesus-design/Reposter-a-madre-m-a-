import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { CheckoutError, createOrder, IdempotencyConflictError } from "@/lib/checkout";
import { createOrderSchema, firstError } from "@/lib/validation";
import { limitByIp, penalizeClient } from "@/lib/rate-limit";
import { PRIVATE_NO_STORE, readJson } from "@/lib/http";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

export const maxDuration = 30;

/** Huella estable del pedido solicitado (para detectar reutilización de la clave de idempotencia). */
function requestHash(input: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex");
}

export async function POST(request: Request) {
  const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_NO_STORE });
  const key = request.headers.get("idempotency-key");
  if (key !== null && !/^[A-Za-z0-9_-]{16,64}$/.test(key)) return json({ error: "Solicitud no válida" }, 400);

  if (!(await limitByIp("orders", 8, 10 * 60_000))) {
    return json({ error: "Has hecho demasiados intentos. Espera unos minutos o llámanos." }, 429);
  }
  const parsed = createOrderSchema.safeParse(await readJson(request, 100_000));
  if (!parsed.success) {
    await penalizeClient(1);
    return json({ error: firstError(parsed.error) }, 400);
  }
  if (parsed.data.website) {
    await penalizeClient(5);
    return json({ error: "Solicitud no válida" }, 400);
  }

  try {
    const { website: _honeypot, ...input } = parsed.data;
    void _honeypot;
    const result = await createOrder(parsed.data, { idempotencyKey: key, requestHash: requestHash(input) });
    return json(result);
  } catch (error) {
    if (error instanceof IdempotencyConflictError) return json({ error: error.message }, 422);
    if (error instanceof CheckoutError) {
      inc("orders_failed_total", { reason: "rejected" });
      return json({ error: error.message }, 409);
    }
    log.error("orders.create_failed", { error });
    return json({ error: "No hemos podido registrar el pedido. Inténtalo de nuevo o llámanos." }, 500);
  }
}
