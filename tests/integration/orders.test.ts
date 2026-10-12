import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSettings, getSettings } from "@/lib/settings";
import { CheckoutError, createOrder, IdempotencyConflictError } from "@/lib/checkout";
import { changeOrderStatus, markOrderPaid, releaseOrderHolds } from "@/lib/order-events";
import { makeProduct, openSlot, orderInput, owner } from "./helpers";

let original: Awaited<ReturnType<typeof getSettings>>["ordering"];

beforeAll(async () => {
  original = (await getSettings()).ordering;
  await saveSettings("ordering", { ...original, onlineOrdersEnabled: true, payInStoreEnabled: true, pickupEnabled: true, minLeadHours: 0, maxOrdersPerSlot: 0, maxOrdersPerDay: 0, autoAcceptStandardOrders: true });
});
afterAll(async () => {
  await saveSettings("ordering", original);
  await owner.$disconnect();
});

describe("integridad de pedidos", () => {
  it("si 20 clientes compran a la vez la última unidad, solo uno la consigue", async () => {
    const product = await makeProduct(1);
    const slot = await openSlot(0);
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => createOrder(orderInput(product.id, slot, i))));
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected.every((r) => (r as PromiseRejectedResult).reason instanceof CheckoutError)).toBe(true);
    const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.stock).toBe(0);
    expect(await db.orderItem.count({ where: { productId: product.id } })).toBe(1);
  });

  it("con stock 5 y 30 compras simultáneas de 2 unidades, se venden como mucho 4 (nunca de más)", async () => {
    const product = await makeProduct(5);
    const slot = await openSlot(0, 1);
    const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => createOrder(orderInput(product.id, slot, 100 + i, 2))));
    const sold = (await db.orderItem.aggregate({ where: { productId: product.id }, _sum: { quantity: true } }))._sum.quantity ?? 0;
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(sold).toBe(4);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(1);
  });

  it("respeta la capacidad por franja aunque lleguen 15 pedidos a la vez", async () => {
    const settings = await getSettings();
    await saveSettings("ordering", { ...settings.ordering, maxOrdersPerSlot: 3 });
    try {
      const product = await makeProduct(null);
      const slot = await openSlot(0, 5);
      const active = { scheduledDate: slot.date, scheduledTime: slot.time, status: { notIn: ["CANCELLED", "REJECTED"] as ("CANCELLED" | "REJECTED")[] } };
      const before = await db.order.count({ where: active });
      const results = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => createOrder(orderInput(product.id, slot, 200 + i))));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3 - before);
      const inSlot = await db.order.count({ where: { scheduledDate: slot.date, scheduledTime: slot.time, status: { notIn: ["CANCELLED", "REJECTED"] } } });
      expect(inSlot).toBe(3);
    } finally {
      await saveSettings("ordering", { ...settings.ordering, maxOrdersPerSlot: 0 });
    }
  });

  it("idempotencia: 10 reintentos simultáneos con la misma clave crean UN pedido", async () => {
    const product = await makeProduct(null);
    const slot = await openSlot(0, 2);
    const input = orderInput(product.id, slot, 300);
    const key = `test-${Date.now()}-abcdefghijklmnop`;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => createOrder(input, { idempotencyKey: key, requestHash: "h1" })));
    const numbers = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ number: string }>).value.number));
    expect(numbers.size).toBe(1);
    expect(await db.order.count({ where: { idempotencyKey: key } })).toBe(1);
    await expect(createOrder(input, { idempotencyKey: key, requestHash: "otro" })).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("los importes se calculan en el servidor (un precio manipulado en el cliente no existe en la API)", async () => {
    const product = await makeProduct(null, 2350);
    const slot = await openSlot(0, 3);
    const tampered = { ...orderInput(product.id, slot, 400, 2), totalCents: 1, priceCents: 1 } as never;
    const { number } = await createOrder(tampered);
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    expect(order.subtotalCents).toBe(4700);
    expect(order.totalCents).toBe(4700);
  });

  it("los datos personales se guardan cifrados y la app los lee descifrados", async () => {
    const product = await makeProduct(null);
    const slot = await openSlot(0, 4);
    const { number } = await createOrder(orderInput(product.id, slot, 500));
    const raw = await owner.$queryRaw<{ customerName: string; customerEmail: string }[]>`SELECT "customerName", "customerEmail" FROM "Order" WHERE number = ${number}`;
    expect(raw[0].customerName.startsWith("enc:v1:")).toBe(true);
    expect(raw[0].customerEmail).not.toContain("@");
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    expect(order.customerName).toBe("Cliente 500");
    const byEmail = await db.order.findMany({ where: { customerEmail: "cliente500@example.com" } });
    expect(byEmail.map((o) => o.number)).toContain(number);
    // Los avisos quedan en la cola dentro de la misma transacción
    expect(await db.job.count({ where: { dedupeKey: `order.confirmed:${order.id}` } })).toBe(1);
  });
});

describe("pagos", () => {
  async function cardOrder(total = 1500) {
    const product = await makeProduct(1, total);
    const slot = await openSlot(0, 6);
    const { number } = await createOrder(orderInput(product.id, slot, 600));
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    // Se simula un pedido con tarjeta pendiente de pago (sin llamar a Stripe)
    await db.order.update({ where: { id: order.id }, data: { status: "PENDING_PAYMENT", paymentMethod: "CARD", paymentStatus: "UNPAID" } });
    await db.job.deleteMany({ where: { dedupeKey: `order.confirmed:${order.id}` } });
    return { order, product };
  }

  it("un importe distinto al calculado no confirma el pedido automáticamente", async () => {
    const { order } = await cardOrder(1500);
    const result = await markOrderPaid(order.id, { paymentIntentId: "pi_x", amountTotal: 100, currency: "eur" });
    expect(result).toBe("mismatch");
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("PENDING");
    expect(after.requiresReview).toBe(true);
  });

  it("dos notificaciones de pago simultáneas confirman una sola vez", async () => {
    const { order } = await cardOrder(1500);
    const pay = { paymentIntentId: "pi_ok", amountTotal: 1500, currency: "eur" };
    const results = await Promise.all([markOrderPaid(order.id, pay), markOrderPaid(order.id, pay), markOrderPaid(order.id, pay)]);
    expect(results.filter((r) => r === "paid")).toHaveLength(1);
    expect(results.filter((r) => r === "already")).toHaveLength(2);
    expect(await db.job.count({ where: { dedupeKey: `order.confirmed:${order.id}` } })).toBe(1);
    expect(await db.orderStatusEvent.count({ where: { orderId: order.id, note: "Pago online recibido" } })).toBe(1);
  });

  it("cancelar dos veces a la vez devuelve el stock una sola vez", async () => {
    const { order, product } = await cardOrder(1500);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(0);
    const r = await Promise.all([releaseOrderHolds(order.id, "CANCELLED", "a"), releaseOrderHolds(order.id, "CANCELLED", "b"), releaseOrderHolds(order.id, "CANCELLED", "c")]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(1);
  });

  it("transiciones de estado simultáneas no se pisan", async () => {
    const product = await makeProduct(null);
    const slot = await openSlot(0, 7);
    const { number } = await createOrder(orderInput(product.id, slot, 700));
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    expect(order.status).toBe("ACCEPTED");
    const r = await Promise.all([changeOrderStatus(order.id, "IN_PREPARATION", { notifyCustomer: false }), changeOrderStatus(order.id, "READY", { notifyCustomer: false })]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });
});
