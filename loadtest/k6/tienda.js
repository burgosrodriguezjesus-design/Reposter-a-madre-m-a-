/**
 * Escenarios de carga k6 de la tienda: mismo recorrido que loadtest/harness.mjs.
 *   70 % navega · 25 % prepara la compra (resumen + disponibilidad) · 5 % pide (pago en tienda)
 *
 * SOLO contra entornos propios y autorizados (local o staging con datos ficticios), NUNCA contra
 * producción ni contra servicios de terceros: los pedidos de prueba son reales en esa BD y la
 * prueba se parece a un ataque de denegación de servicio. Avisa antes al proveedor si su
 * política lo exige (Vercel, Cloudflare, Supabase...).
 *
 *   DATABASE_URL=<bd de staging> node loadtest/k6/export-catalog.mjs > loadtest/k6/catalog.json
 *   k6 run -e BASE_URL=https://staging.example.es -e PERFIL=500 -e AUTORIZADO=si loadtest/k6/tienda.js
 *
 * PERFIL: humo (5 VU) · 100 · 500 · 1000 · 5000 · 10000 (rampa, meseta y bajada).
 * Para 5000+ VU usa varios generadores (k6 distribuido / k6 Cloud): un solo equipo se
 * convierte en el cuello de botella y falsea el resultado.
 * Con LOADTEST_IP=1 envía X-Loadtest-IP (solo lo respeta el balanceador de pruebas de
 * loadtest/results/nginx-loadtest.conf) para que cada VU tenga su propia "IP" y los límites por
 * IP actúen como con clientes reales. Sin ella, todos los VU comparten la IP del generador y los
 * límites por IP (proxy.ts) devolverán 429: eso es el sistema protegiéndose, no un fallo.
 *
 * Integridad: al terminar, loadtest/k6/verify-orders.mjs con el "emailPedidos" y los
 * "pedidosConfirmados" del resumen comprueba que cada pedido confirmado (200) existe en la BD y
 * que ninguna Idempotency-Key se ha repetido.
 */
import http from "k6/http";
import { check, sleep, fail } from "k6";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

if (__ENV.AUTORIZADO !== "si") fail("Define -e AUTORIZADO=si para confirmar que BASE_URL es un entorno propio y autorizado");
const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
if (__ENV.HOST_PRODUCCION && BASE.includes(__ENV.HOST_PRODUCCION)) fail("BASE_URL apunta a producción: prueba cancelada");

const catalog = new SharedArray("catalogo", () => [JSON.parse(open(__ENV.CATALOGO || "./catalog.json"))])[0];
// El código de inicio se ejecuta UNA VEZ POR VU: el identificador de la prueba se fija en setup()
// (una sola vez) y llega a cada iteración como argumento.
const emailDe = (runId) => `carga-k6-${runId}@example.com`;

const PERFILES = {
  humo: { vus: 5, rampa: "10s", meseta: "30s" },
  100: { vus: 100, rampa: "30s", meseta: "2m" },
  500: { vus: 500, rampa: "1m", meseta: "3m" },
  1000: { vus: 1000, rampa: "2m", meseta: "5m" },
  5000: { vus: 5000, rampa: "5m", meseta: "5m" },
  10000: { vus: 10000, rampa: "8m", meseta: "5m" },
};
const perfil = PERFILES[__ENV.PERFIL || "humo"];
if (!perfil) fail(`PERFIL desconocido: ${__ENV.PERFIL}`);

export const options = {
  scenarios: {
    tienda: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: perfil.rampa, target: perfil.vus },
        { duration: perfil.meseta, target: perfil.vus },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  // Objetivos (SLO de docs/operaciones/alta-disponibilidad.md). Si no se cumplen, k6 sale con
  // código ≠ 0: el resultado es "no soporta este perfil con esta infraestructura".
  thresholds: {
    "http_req_failed{grupo:paginas}": ["rate<0.01"],
    "http_req_failed{grupo:api}": ["rate<0.01"],
    "http_req_duration{grupo:paginas}": ["p(95)<1500"],
    "http_req_duration{grupo:api}": ["p(95)<1000"],
    "http_req_duration{grupo:pedidos}": ["p(95)<3000"],
    pedidos_fallidos: ["count<1"],
  },
  discardResponseBodies: false,
  insecureSkipTLSVerify: __ENV.INSECURE_TLS === "1",
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
};

const pedidosConfirmados = new Counter("pedidos_confirmados");
const pedidosRechazados = new Counter("pedidos_rechazados_negocio");
const pedidosFallidos = new Counter("pedidos_fallidos");
const latenciaPedido = new Trend("latencia_pedido", true);

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const think = () => sleep(1 + Math.random() * 2);

function headers(extra = {}) {
  const h = { "accept-encoding": "gzip", ...extra };
  if (__ENV.LOADTEST_IP === "1") {
    const i = exec.vu.idInTest;
    h["x-loadtest-ip"] = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
  }
  return h;
}

function get(path, grupo) {
  return http.get(`${BASE}${path}`, { headers: headers(), tags: { grupo, name: grupo === "paginas" ? path.replace(/\/(producto|categoria)\/.*/, "/$1/:slug") : path.split("?")[0] } });
}

function post(path, body, grupo, extra = {}) {
  return http.post(`${BASE}${path}`, JSON.stringify(body), {
    headers: headers({ "content-type": "application/json", origin: BASE, ...extra }),
    tags: { grupo, name: path },
    timeout: "30s",
  });
}

function item(p) {
  return { kind: "product", productId: p.id, variantId: p.variantId ?? undefined, quantity: 1 + Math.floor(Math.random() * 2), options: {} };
}

function navegar() {
  const paginas = ["/", "/productos", `/categoria/${pick(catalog.categories)}`, `/producto/${pick(catalog.slugs)}`, pick(["/donde-estamos", "/opiniones", "/alergenos", "/condiciones-de-compra"])];
  for (const path of paginas.slice(0, 2 + Math.floor(Math.random() * 3))) {
    check(get(path, "paginas"), { "página 200": (r) => r.status === 200 });
    think();
  }
}

function preparar(p) {
  get(`/producto/${p.slug}`, "paginas");
  think();
  check(post("/api/checkout/preview", { items: [item(p)], fulfillment: "PICKUP" }, "api"), { "resumen 200": (r) => r.status === 200 });
  think();
  return get(`/api/availability?lead=${Math.max(24, p.leadTimeHours)}`, "api");
}

function comprar(runId) {
  const p = pick(catalog.orderable);
  const disp = preparar(p);
  let slot;
  try {
    const dias = disp.json("days").filter((d) => d.status === "open");
    const d = pick(dias.slice(0, 10));
    const s = pick(d.slots.filter((x) => x.available));
    slot = { date: d.date, time: s.time };
  } catch {
    return; // sin huecos libres: no es un error del sistema
  }
  think();
  const body = {
    items: [item(p)],
    fulfillment: "PICKUP",
    date: slot.date,
    time: slot.time,
    customer: { name: "Cliente Carga", email: emailDe(runId), phone: "600000000" },
    paymentMethod: "IN_STORE",
    acceptTerms: true,
    marketingConsent: false,
  };
  const key = `k6-${runId}-${exec.vu.idInTest}-${exec.vu.iterationInScenario}`;
  let r = post("/api/orders", body, "pedidos", { "idempotency-key": key });
  // Reintento seguro: la misma Idempotency-Key nunca duplica el pedido
  if (r.status === 0 || r.status >= 500) r = post("/api/orders", body, "pedidos", { "idempotency-key": key });
  latenciaPedido.add(r.timings.duration);
  if (r.status === 200) pedidosConfirmados.add(1);
  else if (r.status === 409 || r.status === 422) pedidosRechazados.add(1); // hueco o stock agotado: respuesta correcta
  else pedidosFallidos.add(1, { status: String(r.status) });
}

export function setup() {
  return { runId: Date.now() };
}

export default function tienda(data) {
  const x = Math.random();
  if (x < 0.7) navegar();
  else if (x < 0.95) preparar(pick(catalog.orderable));
  else comprar(data.runId);
  think();
}

export function handleSummary(data) {
  const m = data.metrics;
  const v = (name, stat) => (m[name] && m[name].values[stat] !== undefined ? m[name].values[stat] : null);
  const runId = data.setup_data ? data.setup_data.runId : "desconocido";
  const resumen = {
    perfil: __ENV.PERFIL || "humo",
    baseUrl: BASE,
    emailPedidos: emailDe(runId),
    peticiones: v("http_reqs", "count"),
    peticionesPorSegundo: v("http_reqs", "rate"),
    tasaErrores: v("http_req_failed", "rate"),
    p95ms: v("http_req_duration", "p(95)"),
    p99ms: v("http_req_duration", "p(99)"),
    pedidosConfirmados: v("pedidos_confirmados", "count") || 0,
    pedidosRechazadosNegocio: v("pedidos_rechazados_negocio", "count") || 0,
    pedidosFallidos: v("pedidos_fallidos", "count") || 0,
    umbrales: Object.fromEntries(Object.entries(m).filter(([, x]) => x.thresholds).map(([k, x]) => [k, Object.values(x.thresholds).every((t) => t.ok)])),
  };
  return {
    stdout: `${JSON.stringify(resumen, null, 2)}\n`,
    [`k6-${resumen.perfil}-${runId}.json`]: JSON.stringify(data),
  };
}
