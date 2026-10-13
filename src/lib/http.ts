import { timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site-url";

/**
 * Defensa CSRF para rutas de API que modifican datos: la petición debe venir de nuestro propio
 * origen (cabecera Origin, o Sec-Fetch-Site en navegadores que no envían Origin).
 * Las Server Actions ya hacen esta comprobación en Next.js; las rutas /api/* no.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(siteUrl()).host]);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && process.env.APP_ENV !== "production") allowed.add(host);
  if (origin) {
    try {
      return allowed.has(new URL(origin).host);
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

export function forbiddenOrigin(): Response {
  return Response.json({ error: "Origen no permitido" }, { status: 403 });
}

/** Cabeceras para respuestas con datos privados: nunca en cachés compartidas (CDN, proxies). */
export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } as const;

/** Lee un cuerpo JSON limitando su tamaño (evita agotar memoria con cuerpos enormes). */
export async function readJson(request: Request, maxBytes = 64_000): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) return null;
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  const text = await request.text().catch(() => "");
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Autorización de tareas programadas: "Authorization: Bearer CRON_SECRET" (comparación en tiempo constante). */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
