/**
 * Micro-caché en memoria por instancia para datos PÚBLICOS y agregados (catálogo, ajustes,
 * ocupación del calendario). Nunca para datos personales.
 * - TTL corto (segundos): los cambios del panel se ven en esa misma instancia al momento
 *   (invalidateMicroCache) y en las demás en cuanto caduca.
 * - "Single-flight": si 500 peticiones piden lo mismo a la vez, solo una va a la base de datos
 *   (evita la estampida cuando caduca una entrada en plena punta de tráfico).
 */
type Entry = { value: unknown; expires: number };
const globalForCache = globalThis as unknown as { microCache?: Map<string, Entry>; inflight?: Map<string, Promise<unknown>> };
const store = (globalForCache.microCache ??= new Map());
const inflight = (globalForCache.inflight ??= new Map());

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      if (store.size > 2000) for (const [k, v] of store) if (v.expires < Date.now()) store.delete(k);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function invalidateMicroCache(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
