import { db } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { eventLoopDelayMs } from "@/lib/load";

/**
 * Preparada para recibir tráfico: base de datos accesible. Redis se informa pero no la hace
 * fallar (sin Redis la app sigue con límites por instancia).
 * La usan el balanceador, Kubernetes y la monitorización externa. Sin datos sensibles.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database = false;
  try {
    await Promise.race([db.$queryRaw`SELECT 1`, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))]);
    database = true;
  } catch {
    database = false;
  }
  const redis = await pingRedis();
  // Redis es opcional: si cae, la app sigue funcionando con límites locales
  const ok = database;
  return Response.json(
    { status: ok ? "ok" : "degraded", database, redis: redis === null ? "not_configured" : redis, eventLoopDelayMs: Math.round(eventLoopDelayMs()), ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
