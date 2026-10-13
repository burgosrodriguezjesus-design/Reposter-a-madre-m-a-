import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { createOrder } from "@/lib/checkout";
import { changeOrderStatus } from "@/lib/order-events";
import { runJobs } from "@/lib/job-handlers";
import { getObradorConnection, parseConnectionCode, removeObradorConnection, saveObradorConnection } from "@/lib/obrador";
import { makeProduct, openSlot, orderInput, owner } from "./helpers";

const TOKEN = `tienda_${"a1B2c3D4e5".repeat(4)}`;
const CODE = `https://obrador.ejemplo.es#${TOKEN}`;

type Sent = { url: string; auth: string | null; body: Record<string, unknown> };
let sent: Sent[] = [];
let reply = 200;
let original: Awaited<ReturnType<typeof getSettings>>["ordering"];

beforeAll(async () => {
  original = (await getSettings()).ordering;
  await saveSettings("ordering", { ...original, onlineOrdersEnabled: true, payInStoreEnabled: true, pickupEnabled: true, minLeadHours: 0, maxOrdersPerSlot: 0, maxOrdersPerDay: 0, autoAcceptStandardOrders: true });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: reply });
  });
});
afterEach(() => {
  sent = [];
  reply = 200;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await removeObradorConnection();
  await saveSettings("ordering", original);
  await owner.$disconnect();
});

/** Ejecuta la cola hasta que no queden trabajos listos (los reintentos programados para más tarde se quedan). */
async function drain() {
  await runJobs({ limit: 20, timeBudgetMs: 10_000 });
}

describe("código de conexión del obrador", () => {
  it("solo acepta https, un dominio y una llave del obrador", () => {
    expect(parseConnectionCode(CODE)).toEqual({ origin: "https://obrador.ejemplo.es", token: TOKEN });
    expect(parseConnectionCode(`  ${CODE}  `)).not.toBeNull();
    for (const bad of [
      `http://obrador.ejemplo.es#${TOKEN}`,
      `https://127.0.0.1#${TOKEN}`,
      `https://[::1]#${TOKEN}`,
      `https://localhost#${TOKEN}`,
      `https://usuario:clave@obrador.ejemplo.es#${TOKEN}`,
      "https://obrador.ejemplo.es#corto",
      "https://obrador.ejemplo.es",
      "no es una url",
    ]) {
      expect(parseConnectionCode(bad), bad).toBeNull();
    }
  });

  it("guarda la llave cifrada (nunca en claro en la base de datos)", async () => {
    expect(await saveObradorConnection(CODE)).toBe(true);
    const row = await db.setting.findUniqueOrThrow({ where: { key: "obrador-connection" } });
    expect(JSON.stringify(row.value)).not.toContain(TOKEN);
    expect((await getObradorConnection())?.token).toBe(TOKEN);
    // No se mezcla con los ajustes generales (que llegan a las páginas públicas)
    expect(JSON.stringify(await getSettings())).not.toContain("obrador-connection");
  });
});

describe("envío de pedidos al obrador", () => {
  it("envía el pedido confirmado y su cancelación, sin email ni datos de pago, y reintenta si falla", async () => {
    await saveObradorConnection(CODE);
    const product = await makeProduct(null, 2250);
    const slot = await openSlot(0);
    const { number } = await createOrder({ ...orderInput(product.id, slot, 700, 2), notes: "Sin nueces" });
    await drain();

    const first = sent.find((s) => s.body.ref === number)!;
    expect(first.url).toBe("https://obrador.ejemplo.es/api/integraciones/tienda/pedidos");
    expect(first.auth).toBe(`Bearer ${TOKEN}`);
    expect(first.body).toMatchObject({
      ref: number,
      status: "confirmado",
      customer: { name: "Cliente 700", phone: "600000000" },
      pickup_date: slot.date,
      pickup_time: slot.time,
      notes: "Sin nueces",
      items: [{ name: "Producto de prueba", quantity: 2, line_total: 45 }],
    });
    expect(JSON.stringify(first.body)).not.toMatch(/cliente700@example\.com|IN_STORE|accessToken/);

    // Cancelado en la web → se avisa al obrador
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    sent = [];
    expect((await changeOrderStatus(order.id, "CANCELLED", { notifyCustomer: false })).ok).toBe(true);
    await drain();
    expect(sent.find((s) => s.body.ref === number)?.body.status).toBe("cancelado");

    // Obrador caído o código revocado: el trabajo queda pendiente para reintentarse (nunca se pierde)
    reply = 503;
    const second = await createOrder(orderInput(product.id, slot, 701));
    await drain();
    const second0 = await db.order.findUniqueOrThrow({ where: { number: second.number } });
    const job = await db.job.findFirstOrThrow({ where: { type: "obrador.sync", payload: { equals: { orderId: second0.id } } } });
    expect(job.status).toBe("PENDING");
    expect(job.lastError).toContain("503");
    expect(job.lastError).not.toContain("Cliente");
  });

  it("sin conexión no se encola nada", async () => {
    await removeObradorConnection();
    const product = await makeProduct(null);
    const slot = await openSlot(0);
    const { number } = await createOrder(orderInput(product.id, slot, 702));
    await drain();
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    expect(await db.job.count({ where: { type: "obrador.sync", payload: { equals: { orderId: order.id } } } })).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
