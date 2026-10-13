/**
 * IP real del cliente. Solo se confía en la cabecera que pone NUESTRO proxy (TRUST_PROXY):
 * un atacante puede enviar X-Forwarded-For falsas para saltarse los límites por IP.
 *  - vercel: x-real-ip / primer valor de x-forwarded-for (Vercel los sobrescribe)
 *  - cloudflare: cf-connecting-ip
 *  - nginx: x-real-ip (infra/nginx lo fija con $remote_addr)
 *  - none: no hay proxy de confianza (desarrollo)
 */
export function ipFromHeaders(h: Headers): string {
  const mode = process.env.TRUST_PROXY ?? (process.env.VERCEL ? "vercel" : "none");
  let ip: string | null = null;
  if (mode === "vercel") ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? null;
  else if (mode === "cloudflare") ip = h.get("cf-connecting-ip");
  else if (mode === "nginx") ip = h.get("x-real-ip");
  ip = ip?.trim() ?? null;
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) return "local";
  return ip;
}

/** Agrupa IPv6 por /64 (un usuario suele controlar todo el bloque). */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  return ip.split(":").slice(0, 4).join(":") + "::/64";
}
