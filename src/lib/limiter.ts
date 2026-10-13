import { getRedis, redisReady } from "@/lib/redis";
import { loadFactor } from "@/lib/load";
import { inc } from "@/lib/metrics";

/**
 * Límite de peticiones adaptativo con ventana deslizante aproximada.
 * - Compartido entre instancias con Redis; si Redis no está disponible, en memoria por instancia.
 * - Se endurece automáticamente si la instancia está saturada (loadFactor) y para las IPs que
 *   acumulan "penalizaciones" (errores de validación, accesos denegados, sondeos...).
 * Las claves usan huellas HMAC: ni Redis ni la memoria guardan IPs en claro.
 */
type Result = { ok: boolean; remaining: number; retryAfterSec: number };

const memory = new Map<string, { n: number; exp: number }>();

function memIncr(key: string, ttlMs: number, by = 1): number {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.exp < now) {
    memory.set(key, { n: by, exp: now + ttlMs });
    if (memory.size > 20_000) for (const [k, v] of memory) if (v.exp < now) memory.delete(k);
    return by;
  }
  cur.n += by;
  return cur.n;
}

function memGet(key: string): number {
  const cur = memory.get(key);
  return cur && cur.exp >= Date.now() ? cur.n : 0;
}

function multiplier(): number {
  // Solo para pruebas de carga en staging; en producción siempre 1.
  if (process.env.APP_ENV === "production") return 1;
  return Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER ?? 1));
}

async function counts(key: string, windowMs: number, penaltyKey?: string): Promise<{ current: number; previous: number; elapsed: number; penalty?: number }> {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const elapsed = (now % windowMs) / windowMs;
  const cur = `rl:${key}:${bucket}`;
  const prev = `rl:${key}:${bucket - 1}`;
  const redis = getRedis();
  if (redis && redisReady()) {
    try {
      // Una sola ida y vuelta a Redis: contador, ventana anterior y penalización
      const m = redis.multi().incr(cur).pexpire(cur, windowMs * 2).get(prev);
      if (penaltyKey) m.get(penaltyKey);
      const res = await m.exec();
      if (res && !res.some(([e]) => e)) return { current: Number(res[0][1]), previous: Number(res[2][1] ?? 0), elapsed, penalty: penaltyKey ? Number(res[3][1] ?? 0) : undefined };
    } catch {
      // Redis lento o caído: se usa la memoria local
    }
  }
  return { current: memIncr(cur, windowMs * 2), previous: memGet(prev), elapsed };
}

export async function penaltyOf(subject: string): Promise<number> {
  const key = `rl:pen:${subject}`;
  const redis = getRedis();
  if (redis && redisReady()) {
    try {
      return Number((await redis.get(key)) ?? 0);
    } catch {
      /* memoria */
    }
  }
  return memGet(key);
}

/** Suma puntos de penalización a un sujeto (normalmente la huella de su IP) durante 1 hora. */
export async function penalize(subject: string, points = 1) {
  const key = `rl:pen:${subject}`;
  const redis = getRedis();
  if (redis && redisReady()) {
    try {
      await redis.multi().incrby(key, points).pexpire(key, 3600_000).exec();
      return;
    } catch {
      /* memoria */
    }
  }
  memIncr(key, 3600_000, points);
}

export async function rateLimit(scope: string, subject: string, limit: number, windowMs: number): Promise<Result> {
  const r = await counts(`${scope}:${subject}`, windowMs, `rl:pen:${subject}`);
  const { current, previous, elapsed } = r;
  const penalty = r.penalty ?? (await penaltyOf(subject));
  const effective = Math.max(1, Math.floor((limit * multiplier() * loadFactor()) / (1 + penalty / 10)));
  const estimated = current + previous * (1 - elapsed);
  const ok = estimated <= effective;
  if (!ok) {
    inc("rate_limit_blocked_total", { scope }, 1, "Peticiones rechazadas por límite");
    // Insistir tras ser bloqueado agrava la penalización
    if (estimated > effective * 2) await penalize(subject, 1);
  }
  return { ok, remaining: Math.max(0, Math.floor(effective - estimated)), retryAfterSec: Math.ceil((windowMs * (1 - elapsed)) / 1000) };
}
