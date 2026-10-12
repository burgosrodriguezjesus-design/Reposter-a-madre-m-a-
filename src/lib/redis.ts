import Redis from "ioredis";
import { log } from "@/lib/logger";

/**
 * Conexión compartida a Redis (opcional). Se usa para límites de peticiones y bloqueos
 * compartidos entre instancias. Si REDIS_URL no está definido o Redis cae, la aplicación sigue
 * funcionando con límites en memoria por instancia (degradación controlada).
 */
const globalForRedis = globalThis as unknown as { redis?: Redis | null };

export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;
  const url = process.env.REDIS_URL;
  if (!url) return (globalForRedis.redis = null);
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 300,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  let lastError = 0;
  client.on("error", (error) => {
    if (Date.now() - lastError > 60_000) log.warn("redis.error", { message: error.message });
    lastError = Date.now();
  });
  return (globalForRedis.redis = client);
}

export function redisReady(): boolean {
  return getRedis()?.status === "ready";
}

export async function pingRedis(): Promise<boolean | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.ping()) === "PONG";
  } catch {
    return false;
  }
}
