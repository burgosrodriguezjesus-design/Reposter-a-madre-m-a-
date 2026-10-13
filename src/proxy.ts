import { NextResponse, type NextRequest } from "next/server";
import { ipBucket, ipFromHeaders } from "@/lib/client-ip";
import { keyedHash } from "@/lib/crypto";
import { rateLimit } from "@/lib/limiter";
import { shouldShedLoad } from "@/lib/load";
import { inc } from "@/lib/metrics";

/**
 * Primera línea de defensa de la aplicación (se ejecuta antes de cada página o API):
 *  1. Descarta tráfico no esencial si la instancia está saturada (503 + Retry-After).
 *  2. Límite global de peticiones por IP (adaptativo, compartido con Redis).
 *  3. Anti-CSRF: las peticiones que modifican datos deben venir de nuestro origen.
 *  4. CSP estricta con nonce en las páginas con datos personales o credenciales.
 *  5. El panel exige cookie de sesión (la validación completa se repite en el servidor).
 * Los WAF/CDN del proveedor (infra/) son la capa anterior frente a DDoS volumétricos.
 */
const SECURE_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
const SESSION_COOKIE = process.env.NODE_ENV === "production" || SECURE_SITE ? "__Host-rmm_admin" : "rmm_admin";

/** Páginas dinámicas que reciben CSP con nonce (sin 'unsafe-inline'). */
const STRICT = ["/admin", "/finalizar-pedido", "/carrito", "/pedido/", "/presupuesto/", "/seguimiento", "/recordatorios", "/baja", "/tarjetas-regalo", "/privacidad/derechos"];
/** Rutas imprescindibles que nunca se descartan por carga. */
const CRITICAL = ["/api/orders", "/api/stripe/webhook", "/api/health", "/finalizar-pedido", "/pedido/", "/admin", "/api/cron", "/api/checkout"];
/** Rutas que reciben POST de servidores externos (autenticadas por firma o secreto, sin Origin). */
const MACHINE = ["/api/stripe/webhook", "/api/cron", "/api/metrics", "/api/health"];

const startsWithAny = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));

function csp(nonce: string | null): string {
  const dev = process.env.NODE_ENV !== "production";
  const script = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`
    : `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`;
  const supabase = process.env.SUPABASE_URL ? ` ${new URL(process.env.SUPABASE_URL).origin}` : "";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase} https://*.google-analytics.com https://*.googletagmanager.com`,
    "font-src 'self'",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "frame-src https://www.google.com https://maps.google.com",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(SECURE_SITE ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    return site === null || site === "same-origin" || site === "none";
  }
  const allowed = new Set<string>();
  if (process.env.NEXT_PUBLIC_SITE_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && (process.env.APP_ENV !== "production" || allowed.size === 0)) allowed.add(host);
  try {
    return allowed.has(new URL(origin).host);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 1. Protección ante saturación
  if (!startsWithAny(pathname, CRITICAL) && shouldShedLoad()) {
    inc("load_shed_total", { kind: pathname.startsWith("/api/") ? "api" : "page" });
    return new NextResponse("Estamos recibiendo muchas visitas. Vuelve a intentarlo en unos segundos.", {
      status: 503,
      headers: { "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }

  // 2. Límite global por IP (las rutas sensibles tienen además su propio límite más estricto)
  if (!startsWithAny(pathname, MACHINE)) {
    const subject = keyedHash("ip", ipBucket(ipFromHeaders(request.headers)));
    const isApi = pathname.startsWith("/api/");
    const write = method !== "GET" && method !== "HEAD";
    const limit = write ? 60 : isApi ? 240 : 600;
    const res = await rateLimit(write ? "global-write" : isApi ? "global-api" : "global-page", subject, limit, 60_000);
    if (!res.ok) {
      return new NextResponse(isApi ? JSON.stringify({ error: "Demasiadas peticiones" }) : "Demasiadas peticiones. Espera un momento.", {
        status: 429,
        headers: { "Retry-After": String(res.retryAfterSec), "Cache-Control": "no-store", ...(isApi ? { "Content-Type": "application/json" } : {}) },
      });
    }
  }

  // 3. Anti-CSRF para todo lo que modifica datos (Server Actions incluidas)
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !startsWithAny(pathname, MACHINE) && !sameOrigin(request)) {
    inc("csrf_blocked_total");
    return new NextResponse("Origen no permitido", { status: 403 });
  }

  // Enlace con token secreto (?t=) a un pedido o presupuesto: se canjea por una cookie HttpOnly
  // limitada a esa página y se quita el token de la URL.
  const access = /^\/(pedido|presupuesto)\/([A-Za-z0-9_-]{1,40})$/.exec(pathname);
  const token = request.nextUrl.searchParams.get("t");
  if (access && method === "GET" && token && /^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("t");
    const res = NextResponse.redirect(clean, 303);
    res.cookies.set(`acc_${access[1] === "pedido" ? "o" : "q"}_${access[2]}`, token, {
      httpOnly: true,
      secure: SECURE_SITE || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: pathname,
      maxAge: 90 * 86_400,
    });
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  const isLogin = pathname.startsWith("/admin/login");

  // 5. Panel: sin cookie de sesión no se llega a renderizar nada
  if (isAdmin && !isLogin && !request.cookies.has(SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const next = pathname !== "/admin" ? `?next=${encodeURIComponent(pathname)}` : "";
    // Redirección en el cliente: si se llega desde un enlace externo (email), la cookie SameSite=Strict
    // no viaja en esa primera navegación pero sí en la siguiente, y así no se pide el acceso de nuevo.
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=/admin/login${next}"><title>Panel</title>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'" } },
    );
  }

  // 4. CSP
  const strict = startsWithAny(pathname, STRICT);
  const nonce = strict ? Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64") : null;
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", policy);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!pathname.startsWith("/api/")) response.headers.set("Content-Security-Policy", policy);
  if (isAdmin || strict) {
    // Páginas privadas: jamás en cachés compartidas ni indexadas
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|demo/|uploads/|robots.txt|sitemap.xml|manifest.webmanifest).*)",
    },
  ],
};
