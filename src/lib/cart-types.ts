import type { CustomCakeSpec } from "@/lib/pricing";

/** Línea del carrito guardada en el navegador. Los precios son orientativos: el servidor los recalcula. */
export type CartLine = {
  key: string;
  kind: "product" | "custom";
  productId?: string;
  slug?: string;
  name: string;
  image?: string;
  variantId?: string | null;
  variantLabel?: string;
  options: Record<string, string[]>;
  optionLabels: string[];
  dedication?: string;
  referencePhotoUrl?: string;
  quantity: number;
  unitPriceCents: number;
  maxPerOrder: number;
  leadTimeHours: number;
  spec?: CustomCakeSpec;
};

/** Lo que se envía al servidor para calcular o crear un pedido. */
export type CartItemInput = {
  kind: "product" | "custom";
  productId?: string;
  variantId?: string | null;
  quantity: number;
  options?: Record<string, string[]>;
  dedication?: string;
  referencePhotoUrl?: string;
  spec?: CustomCakeSpec;
};

export function toItemInputs(lines: CartLine[]): CartItemInput[] {
  return lines.map((l) => ({
    kind: l.kind,
    productId: l.productId,
    variantId: l.variantId ?? null,
    quantity: l.quantity,
    options: l.options,
    dedication: l.dedication || undefined,
    referencePhotoUrl: l.referencePhotoUrl || undefined,
    spec: l.spec,
  }));
}

export type CheckoutPreview = {
  ok: boolean;
  errors: string[];
  lines: { name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  giftCardCents: number;
  totalCents: number;
  leadHours: number;
  requiresReview: boolean;
  coupon: { code: string; description: string } | null;
  couponError: string | null;
  giftCard: { code: string; balanceCents: number } | null;
  giftCardError: string | null;
  zone: { name: string; minOrderCents: number; freeFromCents: number | null } | null;
  zoneError: string | null;
};
