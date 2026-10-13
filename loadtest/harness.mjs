/**
 * Arnés de carga con usuarios virtuales (alternativa a k6 cuando no está instalado).
 * SOLO contra entornos propios y autorizados (local o staging), nunca contra producción.
 *
 *   BASE_URL=https://localhost:8443 VUS=1000 DURATION=60 RAMP=20 INSECURE_TLS=1 \
 *   DATABASE_URL=<bd de pruebas> node loadtest/harness.mjs > resultado.json
 *
 * Cada usuario virtual repite un recorrido realista con pausas (THINK_MIN-THINK_MAX s):
 *   70 % navega (inicio, catálogo, categoría, producto, página local)
 *   25 % prepara la compra (resumen del carrito y disponibilidad)
 *    5 % hace un pedido real (pago en tienda) con Idempotency-Key
 * Cada usuario simula su propia IP con la cabecera X-Loadtest-IP (el balanceador de pruebas
 * la convierte en X-Real-IP) para que los límites por IP actúen como con usuarios reales.
 * Al terminar comprueba en la BD que no se ha perdido ni duplicado ningún pedido confirmado.
 */
import https from "node:https";
import http from "node:http";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = new URL(process.env.BASE_URL ?? "https://localhost:8443");
const VUS = Number(process.env.VUS ?? 100);
const DURATION = Number(process.env.DURATION ?? 60) * 1000;
const RAMP = Number(process.env.RAMP ?? 15) * 1000;
const THINK_MIN = Number(process.env.THINK_MIN ?? 1) * 1000;
const THINK_MAX = Number(process.env.THINK_MAX ?? 3) * 1000;
const TIMEOUT = Number(process.env.TIMEOUT_MS ?? 15000);
const ORDER_EMAIL = `carga-${Date.now()}@example.com`;

const lib = BASE.protocol === "https:" ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: VUS + 50, rejectUnauthorized: process.env.INSECURE_TLS !== "1" });

const stats = {};
const statuses = {};
const orderNumbers = [];
const rejections = [];
let ordersAttempted = 0;
let networkErrors = 0;
const group = (g) => (stats[g] ??= { lat: [], ok: 0, err: 0 });

function request(method, path, { body, headers = {}, ip } = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const data = body ? JSON.stringify(body) : undefined;
    const req = lib.request(
      { hostname: BASE.hostname, port: BASE.port, path, method, agent, timeout: TIMEOUT, headers: { "x-loadtest-ip": ip, "accept-encoding": "identity", ...(data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data), origin: BASE.origin } : {}), ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, ms: performance.now() - start, text: Buffer.concat(chunks).toString() }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ status: 0, ms: performance.now() - start, text: "", error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

async function hit(g, method, path, opts) {
  const r = await request(method, path, opts);
  const s = group(g);
  s.lat.push(r.ms);
  statuses[`${g} ${r.status}`] = (statuses[`${g} ${r.status}`] ?? 0) + 1;
  if (r.status === 0) networkErrors++;
  if (r.status >= 200 && r.status < 400) s.ok++;
  else s.err++;
  return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let catalog;
async function loadCatalog() {
  const db = new PrismaClient();
  try {
    const products = await db.product.findMany({
      where: { active: true, archived: false, availability: { in: ["AVAILABLE", "ON_DEMAND"] }, stock: null, allowDedication: false },
      select: { id: true, slug: true, optionGroups: true, leadTimeHours: true, maxPerOrder: true, variants: { select: { id: true }, take: 1 }, category: { select: { slug: true } } },
    });
    const orderable = products.filter((p) => Array.isArray(p.optionGroups) && p.optionGroups.every((g) => !g.required) && p.leadTimeHours <= 72 && p.maxPerOrder >= 2);
    return { products, orderable, categories: [...new Set(products.map((p) => p.category.slug))] };
  } finally {
    await db.$disconnect();
  }
}

async function browse(ip) {
  const p = pick(catalog.products);
  const pages = ["/", "/productos", `/categoria/${pick(catalog.categories)}`, `/producto/${p.slug}`, pick(["/donde-estamos", "/opiniones", "/alergenos", "/condiciones-de-compra"])];
  for (const path of pages.slice(0, 2 + Math.floor(Math.random() * 3))) {
    await hit("paginas", "GET", path, { ip });
    await think();
  }
}

function itemFor(p) {
  return { kind: "product", productId: p.id, variantId: p.variants[0]?.id, quantity: 1 + Math.floor(Math.random() * 2), options: {} };
}

async function prepare(ip, product) {
  const p = product ?? pick(catalog.orderable);
  await hit("paginas", "GET", `/producto/${p.slug}`, { ip });
  await think();
  await hit("api", "POST", "/api/checkout/preview", { ip, body: { items: [itemFor(p)], fulfillment: "PICKUP" } });
  await think();
  return hit("api", "GET", `/api/availability?lead=${Math.max(24, p.leadTimeHours)}`, { ip });
}

async function buy(ip) {
  const p = pick(catalog.orderable);
  const avail = await prepare(ip, p);
  let slot = null;
  try {
    const days = JSON.parse(avail.text).days.filter((d) => d.status === "open");
    const d = pick(days.slice(0, 10));
    const s = pick(d.slots.filter((x) => x.available));
    slot = { date: d.date, time: s.time };
  } catch {
    return;
  }
  await think();
  const body = {
    items: [itemFor(p)],
    fulfillment: "PICKUP",
    date: slot.date,
    time: slot.time,
    customer: { name: "Cliente Carga", email: ORDER_EMAIL, phone: "600000000" },
    paymentMethod: "IN_STORE",
    acceptTerms: true,
    marketingConsent: false,
  };
  const key = randomBytes(16).toString("hex");
  ordersAttempted++;
  let r = await hit("pedidos", "POST", "/api/orders", { ip, body, headers: { "idempotency-key": key } });
  // Reintento seguro ante error de red o 5xx: la misma clave nunca duplica el pedido
  if (r.status === 0 || r.status >= 500) r = await hit("pedidos", "POST", "/api/orders", { ip, body, headers: { "idempotency-key": key } });
  if (r.status === 409 && rejections.length < 50) rejections.push(r.text.slice(0, 120));
  if (r.status === 200) {
    try {
      orderNumbers.push(JSON.parse(r.text).number);
    } catch {
      /* respuesta inesperada */
    }
  }
}

async function vu(i, until) {
  const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
  while (Date.now() < until) {
    const x = Math.random();
    if (x < 0.7) await browse(ip);
    else if (x < 0.95) await prepare(ip);
    else await buy(ip);
    await think();
  }
}

const samples = [];
const prevTicks = new Map();
let prevTime = Date.now();
const HZ = 100;
/** CPU instantáneo (% de un núcleo) por grupo de procesos, a partir de /proc/<pid>/stat. */
function sample() {
  try {
    const now = Date.now();
    const dt = (now - prevTime) / 1000;
    prevTime = now;
    const groups = { app: 0, nginx: 0, postgres: 0, redis: 0, pgbouncer: 0, generator: 0 };
    const rss = { app: 0 };
    for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
      let cmd, stat;
      try {
        cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
        stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      } catch {
        continue;
      }
      const g = /^next-server/.test(cmd) ? "app" : /^nginx: worker/.test(cmd) ? "nginx" : /^postgres/.test(cmd) ? "postgres" : /redis-server/.test(cmd) ? "redis" : /^pgbouncer/.test(cmd) ? "pgbouncer" : Number(pid) === process.pid ? "generator" : null;
      if (!g) continue;
      const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const ticks = Number(f[11]) + Number(f[12]);
      const prev = prevTicks.get(pid);
      prevTicks.set(pid, ticks);
      if (prev !== undefined && dt > 0) groups[g] += ((ticks - prev) / HZ / dt) * 100;
      if (g === "app") rss.app += (Number(f[21]) * 4096) / 1048576;
    }
    const pgConn = Number(execSync(`psql "${process.env.DIRECT_URL}" -tAc "select count(*) from pg_stat_activity where datname = current_database()"`, { encoding: "utf8" }).trim());
    const load = Number(readFileSync("/proc/loadavg", "utf8").split(" ")[0]);
    samples.push({ t: now, cpu: groups, appRssMb: rss.app, pgConn, load });
  } catch {
    /* muestreo opcional */
  }
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

async function main() {
  catalog = await loadCatalog();
  const started = Date.now();
  const until = started + DURATION;
  const sampler = setInterval(sample, 3000);
  const vus = [];
  for (let i = 0; i < VUS; i++) {
    await sleep(RAMP / VUS);
    vus.push(vu(i + 1, until));
  }
  await Promise.all(vus);
  clearInterval(sampler);
  const elapsed = (Date.now() - started) / 1000;

  // Integridad: cada pedido confirmado al cliente existe UNA vez en la BD y no hay otros
  const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  const { emailHash } = await import("../src/lib/crypto.ts").catch(() => ({}));
  let integrity = null;
  if (emailHash) {
    const rows = await db.order.findMany({ where: { customerEmailHash: emailHash(ORDER_EMAIL) }, select: { number: true, idempotencyKey: true } });
    const inDb = new Set(rows.map((r) => r.number));
    const keys = rows.map((r) => r.idempotencyKey);
    integrity = {
      confirmedToClients: orderNumbers.length,
      distinctConfirmed: new Set(orderNumbers).size,
      inDatabase: rows.length,
      missingInDb: orderNumbers.filter((n) => !inDb.has(n)).length,
      notConfirmedButInDb: rows.filter((r) => !orderNumbers.includes(r.number)).length,
      duplicatedIdempotencyKeys: keys.length - new Set(keys).size,
    };
  }
  await db.$disconnect();

  const allLat = Object.values(stats).flatMap((s) => s.lat);
  const total = allLat.length;
  const summary = {
    config: { base: BASE.origin, vus: VUS, durationS: DURATION / 1000, rampS: RAMP / 1000, thinkS: [THINK_MIN / 1000, THINK_MAX / 1000] },
    elapsedS: Math.round(elapsed),
    requests: total,
    rps: Math.round(total / elapsed),
    networkErrors,
    errorRate: total ? +(Object.values(stats).reduce((a, s) => a + s.err, 0) / total).toFixed(4) : 0,
    groups: Object.fromEntries(Object.entries(stats).map(([g, s]) => [g, { n: s.lat.length, ok: s.ok, err: s.err, p50: pct(s.lat, 50), p95: pct(s.lat, 95), p99: pct(s.lat, 99), max: Math.round(Math.max(...s.lat)) }])),
    statuses,
    orders: { attempted: ordersAttempted, completed: orderNumbers.length, rejectionReasons: [...new Set(rejections)].slice(0, 8) },
    integrity,
    resources: samples.length > 1
      ? {
          note: "% de CPU de UN núcleo (400 % = los 4 núcleos de esta máquina)",
          cpuPeakPct: Object.fromEntries(Object.keys(samples[1].cpu).map((k) => [k, Math.round(Math.max(...samples.slice(1).map((s) => s.cpu[k])))])),
          cpuAvgPct: Object.fromEntries(Object.keys(samples[1].cpu).map((k) => [k, Math.round(samples.slice(1).reduce((a, s) => a + s.cpu[k], 0) / (samples.length - 1))])),
          maxAppRssMb: Math.round(Math.max(...samples.map((s) => s.appRssMb))),
          maxPgConnections: Math.max(...samples.map((s) => s.pgConn)),
          maxLoadAvg: Math.max(...samples.map((s) => s.load)),
        }
      : null,
  };
  console.log(JSON.stringify(summary, null, 2));
  agent.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
