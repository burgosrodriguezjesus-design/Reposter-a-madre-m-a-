/**
 * Cálculo de precios. Funciones puras compartidas por el navegador (estimaciones)
 * y el servidor (precio definitivo: nunca se confía en importes enviados por el cliente).
 */
import type { BuilderSettings } from "@/lib/settings-types";

export type OptionChoice = { id: string; label: string; priceDeltaCents: number };
export type OptionGroup = {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  choices: OptionChoice[];
};
export type SelectedOption = { group: string; choice: string; priceDeltaCents: number };

export type CustomCakeSpec = {
  celebration: string;
  sizeId: string;
  spongeId: string;
  fillingId: string;
  coveringId: string;
  colorIds: string[];
  decorationIds: string[];
  text: string;
};

type PricedProduct = {
  name: string;
  priceCents: number;
  maxPerOrder: number;
  allowDedication: boolean;
  variants: { id: string; name: string; priceCents: number; servings?: string | null }[];
  optionGroups: unknown;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export function parseOptionGroups(value: unknown): OptionGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((g): g is OptionGroup => !!g && typeof g === "object" && "id" in g && "choices" in g)
    .map((g) => ({
      id: String(g.id),
      name: String(g.name ?? ""),
      required: Boolean(g.required),
      multiple: Boolean(g.multiple),
      choices: Array.isArray(g.choices)
        ? g.choices.map((c) => ({
            id: String(c.id),
            label: String(c.label ?? ""),
            priceDeltaCents: Number(c.priceDeltaCents) || 0,
          }))
        : [],
    }));
}

/** Precio "desde" de un producto (el tamaño más barato si tiene tamaños). */
export function fromPrice(product: { priceCents: number; variants: { priceCents: number }[] }): number {
  if (product.variants.length === 0) return product.priceCents;
  return Math.min(...product.variants.map((v) => v.priceCents));
}

export function priceProductLine(
  product: PricedProduct,
  input: { variantId?: string | null; quantity: number; options: Record<string, string[]> },
): Result<{ unitPriceCents: number; variantName: string | null; options: SelectedOption[] }> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, error: `Cantidad no válida para ${product.name}` };
  }
  if (input.quantity > product.maxPerOrder) {
    return { ok: false, error: `Máximo ${product.maxPerOrder} unidades de ${product.name} por pedido` };
  }

  let unit = product.priceCents;
  let variantName: string | null = null;
  if (product.variants.length > 0) {
    const variant = product.variants.find((v) => v.id === input.variantId);
    if (!variant) return { ok: false, error: `Elige un tamaño para ${product.name}` };
    unit = variant.priceCents;
    variantName = variant.servings ? `${variant.name} (${variant.servings})` : variant.name;
  }

  const groups = parseOptionGroups(product.optionGroups);
  const selected: SelectedOption[] = [];
  for (const group of groups) {
    const ids = input.options[group.id] ?? [];
    if (group.required && ids.length === 0) {
      return { ok: false, error: `Elige "${group.name}" en ${product.name}` };
    }
    if (!group.multiple && ids.length > 1) {
      return { ok: false, error: `Solo puedes elegir una opción de "${group.name}"` };
    }
    for (const id of new Set(ids)) {
      const choice = group.choices.find((c) => c.id === id);
      if (!choice) return { ok: false, error: `Opción no disponible en ${product.name}` };
      unit += choice.priceDeltaCents;
      selected.push({ group: group.name, choice: choice.label, priceDeltaCents: choice.priceDeltaCents });
    }
  }
  const unknownGroup = Object.keys(input.options).find(
    (k) => (input.options[k]?.length ?? 0) > 0 && !groups.some((g) => g.id === k),
  );
  if (unknownGroup) return { ok: false, error: `Opción no disponible en ${product.name}` };

  return { ok: true, unitPriceCents: Math.max(0, unit), variantName, options: selected };
}

export function priceCustomCake(
  builder: BuilderSettings,
  spec: CustomCakeSpec,
): Result<{
  priceCents: number;
  requiresQuote: boolean;
  summary: { label: string; value: string }[];
  sizeLabel: string;
}> {
  const size = builder.sizes.find((s) => s.id === spec.sizeId);
  if (!size) return { ok: false, error: "Elige un tamaño" };
  const sponge = builder.sponges.find((s) => s.id === spec.spongeId);
  if (!sponge) return { ok: false, error: "Elige el sabor del bizcocho" };
  const filling = builder.fillings.find((s) => s.id === spec.fillingId);
  if (!filling) return { ok: false, error: "Elige el relleno" };
  const covering = builder.coverings.find((s) => s.id === spec.coveringId);
  if (!covering) return { ok: false, error: "Elige la cobertura" };

  const colorIds = [...new Set(spec.colorIds)];
  if (colorIds.length > builder.maxColors) {
    return { ok: false, error: `Puedes elegir hasta ${builder.maxColors} colores` };
  }
  const colors = colorIds.map((id) => builder.colors.find((c) => c.id === id));
  if (colors.some((c) => !c)) return { ok: false, error: "Color no disponible" };

  const decorations = [...new Set(spec.decorationIds)].map((id) => builder.decorations.find((d) => d.id === id));
  if (decorations.some((d) => !d)) return { ok: false, error: "Decoración no disponible" };

  const text = spec.text.trim();
  if (text.length > builder.textMaxLength) {
    return { ok: false, error: `El texto admite hasta ${builder.textMaxLength} caracteres` };
  }

  const validColors = colors as NonNullable<(typeof colors)[number]>[];
  const validDecorations = decorations as NonNullable<(typeof decorations)[number]>[];

  const price =
    size.priceCents +
    sponge.priceDeltaCents +
    filling.priceDeltaCents +
    covering.priceDeltaCents +
    validColors.reduce((sum, c) => sum + c.priceDeltaCents, 0) +
    validDecorations.reduce((sum, d) => sum + d.priceDeltaCents, 0) +
    (text ? builder.textPriceCents : 0);

  const summary = [
    { label: "Celebración", value: spec.celebration || "—" },
    { label: "Tamaño", value: `${size.label} · ${size.servings}` },
    { label: "Bizcocho", value: sponge.label },
    { label: "Relleno", value: filling.label },
    { label: "Cobertura", value: covering.label },
    { label: "Colores", value: validColors.map((c) => c.label).join(", ") || "A elección del obrador" },
    { label: "Decoración", value: validDecorations.map((d) => d.label).join(", ") || "Sencilla" },
    { label: "Texto", value: text || "Sin texto" },
  ];

  return {
    ok: true,
    priceCents: price,
    requiresQuote: validDecorations.some((d) => d.requiresQuote),
    summary,
    sizeLabel: size.label,
  };
}

export type CouponLike = {
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  value: number;
  minOrderCents: number;
};

export function couponDiscount(coupon: CouponLike, subtotalCents: number, deliveryFeeCents: number) {
  if (subtotalCents < coupon.minOrderCents) return { discountCents: 0, applies: false };
  switch (coupon.type) {
    case "PERCENT":
      return {
        discountCents: Math.round((subtotalCents * Math.min(100, Math.max(0, coupon.value))) / 100),
        applies: true,
      };
    case "FIXED":
      return { discountCents: Math.min(subtotalCents, coupon.value), applies: true };
    case "FREE_DELIVERY":
      return { discountCents: deliveryFeeCents, applies: deliveryFeeCents > 0 };
  }
}

export function computeTotals(input: {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  giftCardBalanceCents?: number;
}) {
  const beforeGiftCard = Math.max(0, input.subtotalCents + input.deliveryFeeCents - input.discountCents);
  const giftCardCents = Math.min(beforeGiftCard, Math.max(0, input.giftCardBalanceCents ?? 0));
  return { beforeGiftCard, giftCardCents, totalCents: beforeGiftCard - giftCardCents };
}

/** Coste de envío de una zona (con envío gratis a partir de cierto importe). */
export function deliveryFee(zone: { feeCents: number; freeFromCents: number | null }, subtotalCents: number) {
  if (zone.freeFromCents != null && subtotalCents >= zone.freeFromCents) return 0;
  return zone.feeCents;
}
