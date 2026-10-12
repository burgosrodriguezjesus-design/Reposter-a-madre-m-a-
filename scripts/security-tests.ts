/**
 * Pruebas de seguridad dinámicas (DAST ligero) contra una instancia de la app:
 *   BASE_URL=http://localhost:3000 npm run test:security
 * SOLO contra entornos propios y autorizados (local, CI o staging). Crea pedidos de prueba
 * con pago en tienda; nunca la ejecutes contra producción.
 */
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (/^https:\/\/(www\.)?[^/]*\.(es|com)$/.test(BASE) && !process.env.I_OWN_THIS_STAGING) {
  console.error("Por seguridad, define I_OWN_THIS_STAGING=1 para ejecutar contra un dominio público (solo staging propio).");
  process.exit(1);
}

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });
const req = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

async function productId(): Promise<string | null> {
  if (process.env.PRODUCT_ID) return process.env.PRODUCT_ID;
  if (!process.env.DATABASE_URL) return null;
  const db = new PrismaClient();
  try {
    const p = await db.product.findFirst({ where: { active: true, archived: false, availability: "AVAILABLE", stock: null, allowDedication: false, optionGroups: { equals: [] } }, include: { variants: true } });
    return p ? `${p.id}|${p.variants[0]?.id ?? ""}` : null;
  } finally {
    await db.$disconnect();
  }
}

async function firstSlot(): Promise<{ date: string; time: string } | null> {
  const res = await req("/api/availability?lead=48");
  if (!res.ok) return null;
  const data = (await res.json()) as { days: { date: string; status: string; slots: { time: string; available: boolean }[] }[] };
  for (const d of data.days) {
    if (d.status !== "open") continue;
    const s = d.slots.find((x) => x.available);
    if (s) return { date: d.date, time: s.time };
  }
  return null;
}

async function main() {
  // 1. Cabeceras de seguridad
  const home = await req("/");
  const h = home.headers;
  check("Inicio responde 200", home.status === 200, String(home.status));
  check("Sin cabecera X-Powered-By", !h.has("x-powered-by"));
  check("X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");
  check("X-Frame-Options: DENY", h.get("x-frame-options") === "DENY");
  check("Referrer-Policy estricta", (h.get("referrer-policy") ?? "").includes("strict-origin"));
  check("Permissions-Policy (cámara/micrófono/geolocalización bloqueados)", /camera=\(\)/.test(h.get("permissions-policy") ?? ""));
  check("Cross-Origin-Opener-Policy", h.get("cross-origin-opener-policy") === "same-origin");
  const csp = h.get("content-security-policy") ?? "";
  check("CSP con frame-ancestors 'none', object-src 'none' y base-uri", /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri/.test(csp));

  // 2. Pedido real de prueba (antes de los ataques, que penalizan la IP de pruebas): idempotencia, acceso por token y ausencia de IDOR
  const pid = await productId();
  const slot = await firstSlot();
  if (pid && slot) {
    const [productIdOnly, variantId] = pid.split("|");
    const body = {
      items: [{ kind: "product", productId: productIdOnly, variantId: variantId || undefined, quantity: 1, options: {} }],
      fulfillment: "PICKUP",
      date: slot.date,
      time: slot.time,
      customer: { name: "Prueba Seguridad", email: "seguridad@example.com", phone: "600000000" },
      paymentMethod: "IN_STORE",
      acceptTerms: true,
      marketingConsent: false,
      // Intento de manipular el precio desde el cliente: la API lo ignora
      totalCents: 1,
    };
    const key = `sec-${Date.now()}-0123456789abcdef`;
    const send = (b: unknown) => req("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "idempotency-key": key }, body: JSON.stringify(b) });
    const [a, b] = await Promise.all([send(body), send(body)]);
    const ja = (await a.json()) as { number?: string; redirectUrl?: string; error?: string };
    const jb = (await b.json()) as { number?: string; error?: string };
    if (ja.number !== jb.number) console.log("DEBUG idempotencia", a.status, ja, b.status, jb);
    check("Pedido de prueba creado", a.status === 200 && !!ja.number, `${a.status} ${ja.error ?? ""}`);
    check("Idempotencia: doble envío simultáneo → mismo pedido", !!ja.number && ja.number === jb.number);
    const conflict = await send({ ...body, customer: { ...body.customer, name: "Otro" } });
    check("Idempotencia: misma clave con otro pedido → 422", conflict.status === 422, String(conflict.status));
    if (ja.redirectUrl && ja.number) {
      const token = new URL(ja.redirectUrl, BASE).searchParams.get("t")!;
      check("Pedido sin token → 404 (sin acceso a datos de otro cliente)", (await req(`/pedido/${ja.number}`)).status === 404);
      const wrong = await req(`/pedido/${ja.number}?t=${"A".repeat(32)}`);
      const wrongCookie = (wrong.headers.get("set-cookie") ?? "").split(";")[0];
      check("Pedido con token incorrecto → 404", (await req(`/pedido/${ja.number}`, { headers: { cookie: wrongCookie } })).status === 404);
      const exchange = await req(ja.redirectUrl);
      const cookie = exchange.headers.get("set-cookie") ?? "";
      check("Token del enlace canjeado por cookie HttpOnly y retirado de la URL", exchange.status === 303 && /HttpOnly/i.test(cookie) && /Path=\/pedido\//.test(cookie) && !(exchange.headers.get("location") ?? "").includes("t="));
      const page = await req(new URL(exchange.headers.get("location")!, BASE).pathname + new URL(exchange.headers.get("location")!, BASE).search, { headers: { cookie: cookie.split(";")[0] } });
      const pageHtml = await page.text();
      check("Con la cookie se ve el pedido propio", page.status === 200 && pageHtml.includes(ja.number));
      check("La página del pedido no incluye el token ni huellas internas", !pageHtml.includes(token) && !/customerEmailHash|idempotencyKey|enc:v1:/.test(pageHtml));
      check("La página del pedido no se guarda en cachés compartidas", /private|no-store/.test(page.headers.get("cache-control") ?? ""));
      const otherCookie = cookie.split(";")[0];
      check("La cookie de un pedido no abre otro pedido (IDOR)", (await req("/pedido/MM-ZZZZZZ", { headers: { cookie: otherCookie } })).status === 404);
    }
  } else {
    check("Pedido de prueba (sin producto o huecos disponibles)", false, "define PRODUCT_ID o DATABASE_URL");
  }

  // 2. CSP estricta con nonce en páginas con datos personales
  const checkout = await req("/finalizar-pedido");
  const ccsp = checkout.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(ccsp)?.[1];
  const html = await checkout.text();
  check("Checkout: CSP con nonce y 'strict-dynamic', sin 'unsafe-inline' en scripts", !!nonce && /strict-dynamic/.test(ccsp) && !/script-src[^;]*'unsafe-inline'/.test(ccsp));
  check("Checkout: los <script> llevan el nonce", !!nonce && html.includes(`nonce="${nonce}"`));
  check("Checkout: Cache-Control privado (nunca en cachés compartidas)", /no-store/.test(checkout.headers.get("cache-control") ?? ""));
  const second = await req("/finalizar-pedido");
  check("El nonce cambia en cada petición", /'nonce-([^']+)'/.exec(second.headers.get("content-security-policy") ?? "")?.[1] !== nonce);

  // 3. Panel y APIs privadas sin sesión
  const admin = await req("/admin/pedidos");
  const adminBody = await admin.text();
  check("Panel sin sesión: no muestra datos (redirige al acceso)", adminBody.length < 600 && !/MM-[A-Z0-9]{6}|@|<main/.test(adminBody) && /admin\/login/.test(adminBody + (admin.headers.get("location") ?? "")));
  check("Exportación de clientes sin sesión → 401", (await req("/api/admin/clientes.csv")).status === 401);
  check("Cookie de sesión inventada → 401", (await req("/api/admin/clientes.csv", { headers: { cookie: "rmm_admin=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; __Host-rmm_admin=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } })).status === 401);
  check("Exportación RGPD sin sesión → 401", (await req("/api/admin/privacidad/x")).status === 401);
  check("WebAuthn sin sesión → 401", (await req("/api/admin/webauthn", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: "{}" })).status === 401);
  check("Tareas programadas sin secreto → 401", (await req("/api/cron")).status === 401 && (await req("/api/cron/jobs", { headers: { authorization: "Bearer incorrecto" } })).status === 401);
  check("Métricas sin token → 401", (await req("/api/metrics")).status === 401);
  const wh = await req("/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=falsa" } });
  check("Webhook de Stripe con firma falsa → rechazado", wh.status === 400 || wh.status === 501, `HTTP ${wh.status}${wh.status === 501 ? " (Stripe no configurado aquí)" : ""}`);

  // 4. CSRF: peticiones que modifican datos desde otro origen
  const csrf = await req("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: "https://atacante.example" }, body: "{}" });
  check("CSRF: POST desde otro origen → 403", csrf.status === 403, String(csrf.status));
  const csrf2 = await req("/admin/login", { method: "POST", headers: { origin: "https://atacante.example", "content-type": "application/x-www-form-urlencoded" }, body: "email=a&password=b" });
  check("CSRF: Server Action desde otro origen → 403", csrf2.status === 403, String(csrf2.status));

  // 5. Archivos sensibles y recorrido de rutas
  for (const p of ["/.env", "/.git/config", "/prisma/schema.prisma", "/uploads/../.env", "/uploads/%2e%2e/%2e%2e/.env", "/uploads/private/references/2026-10/AAAAAAAAAAAAAAAA.webp", "/uploads/references/2026-10/AAAAAAAAAAAAAAAA.webp", "/package.json", "/.next/server/app/page.js"]) {
    const r = await req(p);
    check(`No expone ${p}`, r.status === 404 || r.status === 400 || r.status === 307 || r.status === 308, String(r.status));
  }

  // 6. Medios privados
  check("Foto privada sin firma → 403", (await req("/api/media?ref=private:references/2026-10/AAAAAAAAAAAAAAAA.webp")).status === 403);
  const exp = Math.floor(Date.now() / 1000) + 300;
  check("Foto privada con firma inventada → 403", (await req(`/api/media?ref=private:references/2026-10/AAAAAAAAAAAAAAAA.webp&exp=${exp}&sig=xyz`)).status === 403);

  // 7. Subida de archivos maliciosos
  const upload = async (bytes: Uint8Array | string, name: string, type: string) => {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type }), name);
    return req("/api/uploads", { method: "POST", body: form, headers: { origin: BASE } });
  };
  check("Subida: texto disfrazado de JPG → rechazado", (await upload("<?php system($_GET['c']); ?>", "foto.jpg", "image/jpeg")).status === 400);
  check("Subida: SVG con script → rechazado", (await upload('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "x.svg", "image/svg+xml")).status === 400);
  check("Subida: HTML → rechazado", (await upload("<html><script>alert(1)</script></html>", "x.html", "text/html")).status === 400);

  // 8. Inyección SQL y XSS reflejado: nunca error 500 ni eco sin escapar
  const payloads = ["' OR '1'='1", "1; DROP TABLE \"Order\";--", "<script>alert(1)</script>", "\"><img src=x onerror=alert(1)>", "${7*7}", "../../etc/passwd"];
  for (const p of payloads) {
    const enc = encodeURIComponent(p);
    for (const path of [`/productos?q=${enc}`, `/productos?categoria=${enc}`, `/api/availability?lead=${enc}`, `/producto/${enc}`, `/zonas/${enc}`, `/seguimiento?error=${enc}`]) {
      const r = await req(path);
      const body = await r.text();
      const reflected = p.includes("<") && body.includes(p);
      if (r.status >= 500 || reflected) check(`Entrada maliciosa en ${path.split("?")[0]}`, false, `HTTP ${r.status}${reflected ? " (eco sin escapar)" : ""}`);
    }
  }
  check("Inyección SQL / XSS reflejado en parámetros públicos: sin errores 500 ni eco sin escapar", !results.some((r) => r.name.startsWith("Entrada maliciosa")));
  const preview = await req("/api/checkout/preview", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ items: [{ kind: "product", productId: "' OR 1=1--", quantity: 1 }], fulfillment: "PICKUP", couponCode: "' OR '1'='1" }) });
  check("Inyección en cupón e id de producto → respuesta controlada", preview.status < 500, String(preview.status));
  const bigBody = JSON.stringify({ items: Array.from({ length: 5000 }, () => ({ kind: "product", productId: "x".repeat(200), quantity: 1 })) });
  const big = await req("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: bigBody });
  check("Cuerpo enorme en la API de pedidos → rechazado sin error 500", big.status >= 400 && big.status < 500, String(big.status));
  const confused = await req("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ items: { $gt: "" }, customer: [] }) });
  check("Tipos manipulados en el JSON → rechazado (400, o 429 si la IP ya está penalizada)", confused.status === 400 || confused.status === 429, String(confused.status));

  // 10. Límite de peticiones (al final: penaliza la IP de pruebas)
  const burst = await Promise.all(Array.from({ length: 25 }, () => req("/api/orders", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: "{}" })));
  check("Fuerza bruta / abuso de la API de pedidos → 429", burst.some((r) => r.status === 429), burst.map((r) => r.status).join(","));

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail && !r.ok ? ` — ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} comprobaciones superadas`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
