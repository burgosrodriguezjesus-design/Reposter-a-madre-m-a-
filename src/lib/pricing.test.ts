import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDER } from "@/config/defaults";
import { computeTotals, couponDiscount, deliveryFee, priceCustomCake, priceProductLine } from "./pricing";

const product = {
  name: "Tarta de queso",
  priceCents: 2500,
  maxPerOrder: 5,
  allowDedication: true,
  variants: [
    { id: "v1", name: "Ø 18 cm", servings: "8 raciones", priceCents: 2800 },
    { id: "v2", name: "Ø 24 cm", servings: "14 raciones", priceCents: 4200 },
  ],
  optionGroups: [
    {
      id: "topping",
      name: "Cobertura",
      required: true,
      multiple: false,
      choices: [
        { id: "natural", label: "Natural", priceDeltaCents: 0 },
        { id: "frutos", label: "Frutos rojos", priceDeltaCents: 300 },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      required: false,
      multiple: true,
      choices: [
        { id: "vela", label: "Vela", priceDeltaCents: 100 },
        { id: "tarjeta", label: "Tarjeta", priceDeltaCents: 150 },
      ],
    },
  ],
};

describe("priceProductLine", () => {
  it("suma tamaño y opciones", () => {
    const r = priceProductLine(product, { variantId: "v2", quantity: 2, options: { topping: ["frutos"], extras: ["vela", "tarjeta"] } });
    expect(r).toMatchObject({ ok: true, unitPriceCents: 4200 + 300 + 100 + 150, variantName: "Ø 24 cm (14 raciones)" });
  });

  it("exige tamaño y opciones obligatorias", () => {
    expect(priceProductLine(product, { quantity: 1, options: { topping: ["natural"] } }).ok).toBe(false);
    expect(priceProductLine(product, { variantId: "v1", quantity: 1, options: {} }).ok).toBe(false);
  });

  it("rechaza opciones inventadas, múltiples no permitidas y cantidades excesivas", () => {
    expect(priceProductLine(product, { variantId: "v1", quantity: 1, options: { topping: ["oro"] } }).ok).toBe(false);
    expect(priceProductLine(product, { variantId: "v1", quantity: 1, options: { topping: ["natural", "frutos"] } }).ok).toBe(false);
    expect(priceProductLine(product, { variantId: "v1", quantity: 6, options: { topping: ["natural"] } }).ok).toBe(false);
    expect(priceProductLine(product, { variantId: "v1", quantity: 1, options: { topping: ["natural"], hack: ["x"] } }).ok).toBe(false);
  });
});

describe("priceCustomCake", () => {
  const spec = {
    celebration: "Cumpleaños",
    sizeId: "s18",
    spongeId: "red-velvet",
    fillingId: "queso",
    coveringId: "buttercream",
    colorIds: ["rosa", "dorado"],
    decorationIds: ["drip"],
    text: "Feliz cumple",
  };

  it("calcula el precio con los importes del administrador", () => {
    const r = priceCustomCake(DEFAULT_BUILDER, spec);
    expect(r).toMatchObject({ ok: true, priceCents: 4200 + 300 + 200 + 0 + 300 + 400, requiresQuote: false });
  });

  it("marca las decoraciones complejas como presupuesto", () => {
    const r = priceCustomCake(DEFAULT_BUILDER, { ...spec, decorationIds: ["figuras"] });
    expect(r).toMatchObject({ ok: true, requiresQuote: true });
  });

  it("valida colores y texto", () => {
    expect(priceCustomCake(DEFAULT_BUILDER, { ...spec, colorIds: ["rosa", "menta", "lavanda", "celeste"] }).ok).toBe(false);
    expect(priceCustomCake(DEFAULT_BUILDER, { ...spec, text: "x".repeat(41) }).ok).toBe(false);
  });
});

describe("cupones, envío y totales", () => {
  it("aplica cupones", () => {
    expect(couponDiscount({ type: "PERCENT", value: 10, minOrderCents: 0 }, 5000, 400).discountCents).toBe(500);
    expect(couponDiscount({ type: "FIXED", value: 8000, minOrderCents: 0 }, 5000, 0).discountCents).toBe(5000);
    expect(couponDiscount({ type: "FREE_DELIVERY", value: 0, minOrderCents: 0 }, 5000, 400).discountCents).toBe(400);
    expect(couponDiscount({ type: "PERCENT", value: 10, minOrderCents: 6000 }, 5000, 0).applies).toBe(false);
  });

  it("calcula envío gratis y tarjeta regalo", () => {
    expect(deliveryFee({ feeCents: 400, freeFromCents: 6000 }, 6000)).toBe(0);
    expect(deliveryFee({ feeCents: 400, freeFromCents: null }, 9000)).toBe(400);
    expect(computeTotals({ subtotalCents: 5000, deliveryFeeCents: 400, discountCents: 500, giftCardBalanceCents: 10000 })).toEqual({
      beforeGiftCard: 4900,
      giftCardCents: 4900,
      totalCents: 0,
    });
  });
});
