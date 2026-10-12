import "server-only";
import { headers } from "next/headers";

/**
 * Limitador de peticiones en memoria (ventana deslizante).
 * Suficiente para frenar abusos en formularios públicos. El inicio de sesión del
 * panel usa además un registro en base de datos (ver lib/auth.ts).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
  return true;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function limitByIp(scope: string, limit: number, windowMs: number): Promise<boolean> {
  return rateLimit(`${scope}:${await clientIp()}`, limit, windowMs);
}
