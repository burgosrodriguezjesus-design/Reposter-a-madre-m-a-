import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { renderMetrics } from "@/lib/metrics";
import { eventLoopDelayMs } from "@/lib/load";

/** Métricas Prometheus de esta instancia. Requiere "Authorization: Bearer METRICS_TOKEN". */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const token = process.env.METRICS_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  if (!token || token.length < 32 || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("No autorizado", { status: 401 });
  let dbUp = 0;
  try {
    await db.$queryRaw`SELECT 1`;
    dbUp = 1;
  } catch {
    dbUp = 0;
  }
  const redis = await pingRedis();
  const extra = [
    `db_up ${dbUp}`,
    `redis_up ${redis === null ? -1 : redis ? 1 : 0}`,
    `nodejs_eventloop_delay_p99_ms ${eventLoopDelayMs().toFixed(1)}`,
  ].join("\n");
  return new Response(`${await renderMetrics()}${extra}\n`, {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
  });
}
