import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { emailHash } from "@/lib/crypto";
import { getSettings, saveSettings } from "@/lib/settings";

// El límite por IP lee las cabeceras de la petición de Next (fuera de una petición real no existen)
vi.mock("@/lib/rate-limit", () => ({ limitByIp: async () => true }));

const { POST } = await import("@/app/api/giftcards/route");
const original = await getSettings();

afterAll(async () => {
  await saveSettings("ordering", original.ordering);
  await saveSettings("marketing", original.marketing);
});

const buy = (paymentMethod: "CARD" | "IN_STORE", email: string) =>
  POST(
    new Request("http://localhost/api/giftcards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: original.marketing.giftCardAmounts[0], purchaserName: "Ana", purchaserEmail: email, paymentMethod, acceptTerms: true }),
    }),
  );

describe("tarjetas regalo con pago online desactivado", () => {
  it("rechaza el pago online aunque se fuerce la petición y permite reservar para pagar en tienda", async () => {
    await saveSettings("ordering", { ...original.ordering, cardPaymentEnabled: false, payInStoreEnabled: true });
    await saveSettings("marketing", { ...original.marketing, giftCardsEnabled: true });

    const card = await buy("CARD", "tarjeta-online@example.com");
    expect(card.status).toBe(400);
    expect((await card.json()).error).toMatch(/pago online no está disponible/);
    expect(await db.giftCard.count({ where: { purchaserEmailHash: emailHash("tarjeta-online@example.com") } })).toBe(0);

    const inStore = await buy("IN_STORE", "tarjeta-tienda@example.com");
    expect(inStore.status).toBe(200);
    const created = await db.giftCard.findFirstOrThrow({ where: { purchaserEmailHash: emailHash("tarjeta-tienda@example.com") } });
    expect(created.paymentMethod).toBe("IN_STORE");
    expect(created.status).toBe("PENDING_PAYMENT");
  });
});
