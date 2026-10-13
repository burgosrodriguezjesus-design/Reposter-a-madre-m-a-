import { afterAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { enqueue, processJobs } from "@/lib/jobs";
import { audit, verifyAuditChain } from "@/lib/audit";
import { eraseSubjectData, exportSubjectData } from "@/lib/privacy";
import { emailHash } from "@/lib/crypto";
import { createOrder } from "@/lib/checkout";
import { makeProduct, openSlot, orderInput, owner } from "./helpers";

afterAll(() => owner.$disconnect());

describe("cola de trabajos", () => {
  it("4 procesadores en paralelo ejecutan cada trabajo exactamente una vez", async () => {
    const tag = `t${Date.now()}`;
    for (let i = 0; i < 60; i++) await enqueue(`test.count.${tag}`, { i });
    const seen = new Map<number, number>();
    const handlers = { [`test.count.${tag}`]: async (p: Record<string, unknown>) => void seen.set(Number(p.i), (seen.get(Number(p.i)) ?? 0) + 1) };
    await Promise.all(Array.from({ length: 4 }, () => processJobs(handlers, { limit: 5, timeBudgetMs: 10_000, types: [`test.count.${tag}`] })));
    expect(seen.size).toBe(60);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });

  it("un fallo se reintenta más tarde y, agotados los intentos, queda en FAILED (sin perderse)", async () => {
    const type = `test.fail.${Date.now()}`;
    await enqueue(type, { x: 1 }, { maxAttempts: 2 });
    const failing = { [type]: async () => Promise.reject(new Error("SMTP caído para ana@example.com")) };
    await processJobs(failing, { types: [type], timeBudgetMs: 2000 });
    const job = await db.job.findFirstOrThrow({ where: { type } });
    expect(job.status).toBe("PENDING");
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.lastError).not.toContain("ana@example.com");
    await db.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await processJobs(failing, { types: [type], timeBudgetMs: 2000 });
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("FAILED");
  });

  it("la deduplicación evita encolar dos veces lo mismo", async () => {
    const key = `dedupe-${Date.now()}`;
    await Promise.all([enqueue("x", {}, { dedupeKey: key }), enqueue("x", {}, { dedupeKey: key }), enqueue("x", {}, { dedupeKey: key })]);
    expect(await db.job.count({ where: { dedupeKey: key } })).toBe(1);
  });
});

describe("registro de auditoría", () => {
  it("la cadena se verifica y detecta manipulaciones hechas directamente en la BD", async () => {
    await Promise.all([1, 2, 3, 4, 5].map((i) => audit({ action: "test.entry", details: { i, email: "ana@example.com" } })));
    const ok = await verifyAuditChain();
    expect(ok.ok).toBe(true);
    const last = await db.auditLog.findFirstOrThrow({ orderBy: { seq: "desc" } });
    expect(JSON.stringify(last.details)).not.toContain("ana@example.com");
    // La aplicación no puede modificarla (trigger)
    await expect(db.$executeRaw`UPDATE "AuditLog" SET action = 'x' WHERE id = ${last.id}`).rejects.toThrow();
    // Un atacante con privilegios de superusuario desactiva el trigger y altera una entrada…
    await owner.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER "AuditLog_no_update_delete"`);
    await owner.$executeRaw`UPDATE "AuditLog" SET action = 'manipulada' WHERE id = ${last.id}`;
    const broken = await verifyAuditChain();
    // …y la verificación lo detecta. Se restaura para no dejar la BD de pruebas rota.
    await owner.$executeRaw`UPDATE "AuditLog" SET action = 'test.entry' WHERE id = ${last.id}`;
    await owner.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER "AuditLog_no_update_delete"`);
    expect(broken.ok).toBe(false);
    expect(broken.brokenAtSeq).toBe(last.seq);
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});

describe("RGPD", () => {
  it("exporta y suprime los datos de una persona (anonimizando lo que hay que conservar)", async () => {
    const product = await makeProduct(null);
    const slot = await openSlot(0, 8);
    const { number } = await createOrder({ ...orderInput(product.id, slot, 800), customer: { name: "Lucía Borrable", email: "borrar@example.com", phone: "611223344" } } as never);
    const ref = "private:references/2026-10/AbCdEfGhIjKlMnOp.webp";
    const created = await db.order.update({ where: { number }, data: { status: "DELIVERED", postalCode: "28001", city: "Madrid", rejectionReason: "nota" }, include: { items: true } });
    await db.orderItem.update({ where: { id: created.items[0].id }, data: { referencePhotoUrl: ref, customSpec: { inscripcion: "Feliz cumple Lucía" } } });
    await db.orderStatusEvent.create({ data: { orderId: created.id, status: "DELIVERED", note: "Entregado a Lucía en mano" } });
    const exported = await exportSubjectData(emailHash("borrar@example.com"));
    expect(exported.orders).toHaveLength(1);
    expect(JSON.stringify(exported)).toContain("Lucía Borrable");
    expect(JSON.stringify(exported)).not.toMatch(/accessToken|customerEmailHash|idempotencyKey/);
    const result = await eraseSubjectData(emailHash("borrar@example.com"));
    expect(result.anonymizedOrders).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { number } });
    expect(order.customerName).toBe("Datos eliminados");
    expect(order.totalCents).toBeGreaterThan(0);
    expect([order.postalCode, order.city, order.rejectionReason]).toEqual([null, null, null]);
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    expect(items.every((i) => i.customSpec === null && i.referencePhotoUrl === null)).toBe(true);
    const events = await db.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events.every((e) => e.note === null)).toBe(true);
    // La foto se borra a través de la cola (reintentos + alerta), encolada en la misma transacción
    expect(await db.job.count({ where: { type: "storage.delete-private", dedupeKey: `delete:${ref}` } })).toBe(1);
    const after = await exportSubjectData(emailHash("borrar@example.com"));
    expect(after.orders).toHaveLength(0);
    expect(JSON.stringify(after)).not.toContain("Lucía");
  });
});

describe("webhook de Stripe", () => {
  const secret = "whsec_test_integration_secret_123456";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_integration_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  const stripe = new Stripe("sk_test_dummy");

  async function post(body: string, signature: string) {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": signature } }));
  }

  it("rechaza firmas no válidas y procesa una sola vez cada evento", async () => {
    const product = await makeProduct(null, 1999);
    const slot = await openSlot(0, 9);
    const { number } = await createOrder(orderInput(product.id, slot, 900));
    const order = await db.order.update({ where: { number }, data: { status: "PENDING_PAYMENT", paymentMethod: "CARD", paymentStatus: "UNPAID" } });
    const event = {
      id: `evt_test_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_test", object: "checkout.session", payment_status: "paid", amount_total: 1999, currency: "eur", payment_intent: "pi_test", metadata: { type: "order", orderId: order.id } } },
    };
    const body = JSON.stringify(event);
    expect((await post(body, "t=1,v1=firma-falsa")).status).toBe(400);
    const tamperedSig = stripe.webhooks.generateTestHeaderString({ payload: body.replace("1999", "1"), secret });
    expect((await post(body, tamperedSig)).status).toBe(400);
    const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    const first = await post(body, sig);
    expect(first.status).toBe(200);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");
    const again = await (await post(body, stripe.webhooks.generateTestHeaderString({ payload: body, secret }))).json();
    expect(again.duplicate).toBe(true);
  });
});
