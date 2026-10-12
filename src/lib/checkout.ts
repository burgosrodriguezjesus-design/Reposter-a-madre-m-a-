import "server-only";
import { Prisma, type Coupon, type DeliveryZone, type GiftCard, type QuoteRequest } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { AllSettings } from "@/lib/settings-types";
import {
  computeTotals,
  couponDiscount,
  deliveryFee,
  priceCustomCake,
  priceProductLine,
  type CustomCakeSpec,
  type SelectedOption,
} from "@/lib/pricing";
import { isOwnUploadUrl } from "@/lib/storage";
import type { CheckoutPreview } from "@/lib/cart-types";
import type { checkoutBaseSchema, CreateOrderInput } from "@/lib/validation";
import { availabilityContext } from "@/lib/schedule";
import { checkSlot } from "@/lib/availability";
import { orderNumber, secureToken } from "@/lib/ids";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { siteUrl } from "@/lib/site-url";
import { formatPrice } from "@/lib/format";
import { onOrderConfirmed, releaseOrderHolds } from "@/lib/order-events";

type CheckoutBase = z.infer<typeof checkoutBaseSchema>;

type PricedLine = {
  productId: string | null;
  name: string;
  variantName: string | null;
  unitPriceCents: number;
  quantity: number;
  options: SelectedOption[];
  dedication: string | null;
  referencePhotoUrl: string | null;
  isCustomCake: boolean;
  customSpec: Prisma.InputJsonValue | undefined;
  lineTotalCents: number;
};

export type PricedCart = {
  errors: string[];
  lines: PricedLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  giftCardCents: number;
  totalCents: number;
  leadHours: number;
  requiresReview: boolean;
  coupon: Coupon | null;
  couponError: string | null;
  giftCard: GiftCard | null;
  giftCardError: string | null;
  zone: DeliveryZone | null;
  zoneError: string | null;
};

export function normalizeCode(code: string | undefined): string {
  return (code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export async function findValidCoupon(code: string): Promise<{ coupon: Coupon | null; error: string | null }> {
  const coupon = await db.coupon.findUnique({ where: { code: normalizeCode(code) } });
  const now = new Date();
  if (!coupon || !coupon.active) return { coupon: null, error: "Código no válido" };
  if (coupon.startsAt && coupon.startsAt > now) return { coupon: null, error: "Este código aún no está activo" };
  if (coupon.endsAt && coupon.endsAt < now) return { coupon: null, error: "Este código ha caducado" };
  if (coupon.maxRedemptions != null && coupon.redemptions >= coupon.maxRedemptions) {
    return { coupon: null, error: "Este código ya se ha agotado" };
  }
  return { coupon, error: null };
}

export async function findValidGiftCard(code: string): Promise<{ card: GiftCard | null; error: string | null }> {
  const card = await db.giftCard.findUnique({ where: { code: normalizeCode(code) } });
  if (!card || card.status !== "ACTIVE") return { card: null, error: "Tarjeta regalo no válida" };
  if (card.expiresAt && card.expiresAt < new Date()) return { card: null, error: "La tarjeta regalo ha caducado" };
  if (card.balanceCents <= 0) return { card: null, error: "La tarjeta regalo no tiene saldo" };
  return { card, error: null };
}

/** Calcula el carrito con los precios reales de la base de datos. */
export async function priceCart(input: CheckoutBase, settings: AllSettings): Promise<PricedCart> {
  const errors: string[] = [];
  const productIds = input.items.filter((i) => i.kind === "product" && i.productId).map((i) => i.productId!);
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: true },
  });

  const lines: PricedLine[] = [];
  let leadHours = settings.ordering.minLeadHours;
  let requiresReview = false;

  for (const item of input.items) {
    if (item.referencePhotoUrl && !isOwnUploadUrl(item.referencePhotoUrl)) {
      errors.push("La foto de referencia no es válida, vuelve a subirla");
      continue;
    }

    if (item.kind === "custom") {
      if (!settings.builder.enabled || !item.spec) {
        errors.push("El personalizador de tartas no está disponible");
        continue;
      }
      const priced = priceCustomCake(settings.builder, item.spec);
      if (!priced.ok) {
        errors.push(priced.error);
        continue;
      }
      if (priced.requiresQuote) {
        errors.push("Tu tarta personalizada necesita presupuesto: solicítalo desde el personalizador");
        continue;
      }
      leadHours = Math.max(leadHours, settings.builder.leadTimeHours);
      requiresReview = true;
      lines.push({
        productId: null,
        name: `Tarta personalizada${item.spec.celebration ? ` · ${item.spec.celebration}` : ""}`,
        variantName: priced.summary.find((s) => s.label === "Tamaño")?.value ?? priced.sizeLabel,
        unitPriceCents: priced.priceCents,
        quantity: 1,
        options: priced.summary
          .filter((s) => !["Celebración", "Tamaño", "Texto"].includes(s.label))
          .map((s) => ({ group: s.label, choice: s.value, priceDeltaCents: 0 })),
        dedication: item.spec.text.trim() || null,
        referencePhotoUrl: item.referencePhotoUrl ?? null,
        isCustomCake: true,
        customSpec: { spec: item.spec, summary: priced.summary } as unknown as Prisma.InputJsonValue,
        lineTotalCents: priced.priceCents,
      });
      continue;
    }

    const product = products.find((p) => p.id === item.productId);
    if (!product || !product.active || product.archived) {
      errors.push("Uno de los productos ya no está disponible. Revisa tu carrito");
      continue;
    }
    if (product.availability === "SOLD_OUT") {
      errors.push(`${product.name} está agotado en este momento`);
      continue;
    }
    const priced = priceProductLine(product, {
      variantId: item.variantId,
      quantity: item.quantity,
      options: item.options ?? {},
    });
    if (!priced.ok) {
      errors.push(priced.error);
      continue;
    }
    const dedication = product.allowDedication ? item.dedication?.trim() || null : null;
    const referencePhotoUrl = product.allowReferencePhoto ? item.referencePhotoUrl ?? null : null;
    if (dedication || referencePhotoUrl) requiresReview = true;
    leadHours = Math.max(leadHours, product.leadTimeHours);
    lines.push({
      productId: product.id,
      name: product.name,
      variantName: priced.variantName,
      unitPriceCents: priced.unitPriceCents,
      quantity: item.quantity,
      options: priced.options,
      dedication,
      referencePhotoUrl,
      isCustomCake: false,
      customSpec: undefined,
      lineTotalCents: priced.unitPriceCents * item.quantity,
    });
  }

  return finishCart(input, settings, { errors, lines, leadHours, requiresReview });
}

type BaseCart = Pick<PricedCart, "errors" | "lines" | "leadHours" | "requiresReview">;

/** Envío, cupón, tarjeta regalo y totales a partir de las líneas ya calculadas. */
async function finishCart(input: CheckoutBase, settings: AllSettings, base: BaseCart): Promise<PricedCart> {
  const { errors, lines, leadHours, requiresReview } = base;
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  // Entrega a domicilio
  let zone: DeliveryZone | null = null;
  let zoneError: string | null = null;
  let deliveryFeeCents = 0;
  if (input.fulfillment === "DELIVERY") {
    if (!settings.ordering.deliveryEnabled) {
      zoneError = "Ahora mismo no hacemos entregas a domicilio";
    } else {
      const cp = (input.postalCode ?? "").trim();
      if (!/^\d{5}$/.test(cp)) {
        zoneError = "Introduce un código postal válido";
      } else {
        zone = await db.deliveryZone.findFirst({ where: { active: true, postalCodes: { has: cp } } });
        if (!zone) zoneError = "Todavía no repartimos en ese código postal. Puedes recogerlo en tienda";
        else if (subtotalCents < zone.minOrderCents) {
          zoneError = `El pedido mínimo para entrega en ${zone.name} es ${formatPrice(zone.minOrderCents)}`;
        } else deliveryFeeCents = deliveryFee(zone, subtotalCents);
      }
    }
    if (zoneError) errors.push(zoneError);
  } else if (!settings.ordering.pickupEnabled) {
    errors.push("La recogida en tienda no está disponible");
  }

  // Cupón
  let coupon: Coupon | null = null;
  let couponError: string | null = null;
  let discountCents = 0;
  if (input.couponCode) {
    const found = await findValidCoupon(input.couponCode);
    couponError = found.error;
    if (found.coupon) {
      const d = couponDiscount(found.coupon, subtotalCents, deliveryFeeCents);
      if (!d.applies) {
        couponError =
          subtotalCents < found.coupon.minOrderCents
            ? `Este código es para pedidos desde ${formatPrice(found.coupon.minOrderCents)}`
            : "Este código no se aplica a tu pedido";
      } else {
        coupon = found.coupon;
        discountCents = d.discountCents;
      }
    }
  }

  // Tarjeta regalo
  let giftCard: GiftCard | null = null;
  let giftCardError: string | null = null;
  if (input.giftCardCode) {
    const found = await findValidGiftCard(input.giftCardCode);
    giftCard = found.card;
    giftCardError = found.error;
  }

  const totals = computeTotals({
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    giftCardBalanceCents: giftCard?.balanceCents ?? 0,
  });

  if (lines.length === 0 && errors.length === 0) errors.push("El carrito está vacío");

  return {
    errors,
    lines,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    giftCardCents: totals.giftCardCents,
    totalCents: totals.totalCents,
    leadHours,
    requiresReview,
    coupon,
    couponError,
    giftCard,
    giftCardError,
    zone,
    zoneError,
  };
}

/** Carrito de un presupuesto aceptado: una tarta personalizada al precio presupuestado. */
export async function priceQuoteCart(quote: QuoteRequest, input: CheckoutBase, settings: AllSettings): Promise<PricedCart> {
  const spec = quote.spec as { spec?: CustomCakeSpec; summary?: { label: string; value: string }[] };
  const summary = spec.summary ?? [];
  const size = summary.find((s) => s.label === "Tamaño")?.value ?? null;
  const price = quote.quotedCents ?? 0;
  const errors: string[] = [];
  if (quote.status !== "QUOTED" || price <= 0) errors.push("Este presupuesto ya no se puede aceptar");
  return finishCart({ ...input, couponCode: undefined }, settings, {
    errors,
    leadHours: 0,
    requiresReview: false,
    lines: [
      {
        productId: null,
        name: `Tarta personalizada${spec.spec?.celebration ? ` · ${spec.spec.celebration}` : ""} (presupuesto ${quote.number})`,
        variantName: size,
        unitPriceCents: price,
        quantity: 1,
        options: summary
          .filter((s) => !["Celebración", "Tamaño", "Texto"].includes(s.label))
          .map((s) => ({ group: s.label, choice: s.value, priceDeltaCents: 0 })),
        dedication: spec.spec?.text?.trim() || null,
        referencePhotoUrl: quote.referencePhotoUrl,
        isCustomCake: true,
        customSpec: quote.spec as Prisma.InputJsonValue,
        lineTotalCents: price,
      },
    ],
  });
}

export function toPreview(cart: PricedCart): CheckoutPreview {
  return {
    ok: cart.errors.length === 0,
    errors: cart.errors,
    lines: cart.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
    })),
    subtotalCents: cart.subtotalCents,
    deliveryFeeCents: cart.deliveryFeeCents,
    discountCents: cart.discountCents,
    giftCardCents: cart.giftCardCents,
    totalCents: cart.totalCents,
    leadHours: cart.leadHours,
    requiresReview: cart.requiresReview,
    coupon: cart.coupon ? { code: cart.coupon.code, description: cart.coupon.description } : null,
    couponError: cart.couponError,
    giftCard: cart.giftCard ? { code: cart.giftCard.code, balanceCents: cart.giftCard.balanceCents } : null,
    giftCardError: cart.giftCardError,
    zone: cart.zone
      ? { name: cart.zone.name, minOrderCents: cart.zone.minOrderCents, freeFromCents: cart.zone.freeFromCents }
      : null,
    zoneError: cart.zoneError,
  };
}

export function paymentOptions(settings: AllSettings) {
  return {
    card: settings.ordering.cardPaymentEnabled && isStripeConfigured(),
    inStore: settings.ordering.payInStoreEnabled,
  };
}

export class CheckoutError extends Error {}

/** Crea el pedido. Devuelve la URL a la que redirigir (Stripe o la confirmación). */
export async function createOrder(
  input: CreateOrderInput,
  quote?: QuoteRequest,
): Promise<{ redirectUrl: string; number: string }> {
  const settings = await getSettings();
  if (!settings.ordering.onlineOrdersEnabled && !quote) throw new CheckoutError(settings.ordering.closedMessage);

  const cart = quote ? await priceQuoteCart(quote, input, settings) : await priceCart(input, settings);
  if (cart.errors.length) throw new CheckoutError(cart.errors[0]);
  if (input.couponCode && cart.couponError) throw new CheckoutError(cart.couponError);
  if (input.giftCardCode && cart.giftCardError) throw new CheckoutError(cart.giftCardError);

  if (input.fulfillment === "DELIVERY" && (!input.address?.street || input.address.street.length < 5)) {
    throw new CheckoutError("Introduce la dirección de entrega");
  }

  const ctx = await availabilityContext(cart.leadHours);
  const slot = checkSlot(input.date, input.time, ctx);
  if (!slot.ok) throw new CheckoutError(slot.error);

  // Forma de pago
  const payments = paymentOptions(settings);
  let paymentMethod = input.paymentMethod as "CARD" | "IN_STORE" | "GIFT_CARD";
  if (cart.totalCents === 0) paymentMethod = "GIFT_CARD";
  else if (paymentMethod === "CARD" && !payments.card) throw new CheckoutError("El pago online no está disponible ahora mismo");
  else if (paymentMethod === "IN_STORE") {
    if (!payments.inStore) throw new CheckoutError("El pago en tienda no está disponible");
    if (input.fulfillment === "DELIVERY") throw new CheckoutError("Los pedidos a domicilio se pagan online");
  }

  // Un presupuesto aceptado ya está confirmado por el obrador
  const confirmedStatus =
    quote || (settings.ordering.autoAcceptStandardOrders && !cart.requiresReview) ? ("ACCEPTED" as const) : ("PENDING" as const);
  const status = paymentMethod === "CARD" ? ("PENDING_PAYMENT" as const) : confirmedStatus;

  const order = await createOrderRecord(input, cart, { status, paymentMethod, quoteRequestId: quote?.id });

  if (paymentMethod === "CARD") {
    const stripe = getStripe()!;
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        locale: "es",
        customer_email: order.customerEmail,
        client_reference_id: order.id,
        metadata: { type: "order", orderId: order.id, orderNumber: order.number },
        payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.number } },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: order.totalCents,
              product_data: {
                name: `Pedido ${order.number} · ${settings.business.name}`,
                description: cart.lines
                  .map((l) => `${l.quantity}× ${l.name}`)
                  .join(", ")
                  .slice(0, 450),
              },
            },
          },
        ],
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: siteUrl(`/pedido/${order.number}?t=${order.accessToken}&pago=ok`),
        cancel_url: quote
          ? siteUrl(`/presupuesto/${quote.id}?t=${quote.accessToken}&cancelado=1`)
          : siteUrl(`/finalizar-pedido?cancelado=${order.number}`),
      });
      await db.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
      return { redirectUrl: session.url!, number: order.number };
    } catch (error) {
      console.error("[stripe] No se pudo crear la sesión de pago", error);
      await releaseOrderHolds(order.id, "CANCELLED", "No se pudo iniciar el pago");
      throw new CheckoutError("No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos");
    }
  }

  await onOrderConfirmed(order.id);
  return { redirectUrl: `/pedido/${order.number}?t=${order.accessToken}&nuevo=1`, number: order.number };
}

async function createOrderRecord(
  input: CreateOrderInput,
  cart: PricedCart,
  opts: {
    status: "PENDING_PAYMENT" | "PENDING" | "ACCEPTED";
    paymentMethod: "CARD" | "IN_STORE" | "GIFT_CARD";
    quoteRequestId?: string;
  },
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        if (cart.giftCard && cart.giftCardCents > 0) {
          const updated = await tx.giftCard.updateMany({
            where: { id: cart.giftCard.id, status: "ACTIVE", balanceCents: { gte: cart.giftCardCents } },
            data: { balanceCents: { decrement: cart.giftCardCents } },
          });
          if (updated.count === 0) throw new CheckoutError("El saldo de la tarjeta regalo ha cambiado. Vuelve a aplicarla");
          await tx.giftCard.updateMany({
            where: { id: cart.giftCard.id, balanceCents: 0 },
            data: { status: "DEPLETED" },
          });
        }
        if (cart.coupon) {
          const updated = await tx.coupon.updateMany({
            where: {
              id: cart.coupon.id,
              ...(cart.coupon.maxRedemptions != null ? { redemptions: { lt: cart.coupon.maxRedemptions } } : {}),
            },
            data: { redemptions: { increment: 1 } },
          });
          if (updated.count === 0) throw new CheckoutError("Este código de descuento ya se ha agotado");
        }

        const paid = opts.paymentMethod === "GIFT_CARD";
        return tx.order.create({
          data: {
            number: orderNumber(),
            accessToken: secureToken(),
            status: opts.status,
            paymentMethod: opts.paymentMethod,
            paymentStatus: paid ? "PAID" : "UNPAID",
            fulfillment: input.fulfillment,
            scheduledDate: input.date,
            scheduledTime: input.time,
            customerName: input.customer.name,
            customerEmail: input.customer.email,
            customerPhone: input.customer.phone,
            address:
              input.fulfillment === "DELIVERY"
                ? [input.address?.street, input.address?.details].filter(Boolean).join(" · ")
                : null,
            postalCode: input.fulfillment === "DELIVERY" ? input.postalCode : null,
            city: input.fulfillment === "DELIVERY" ? input.address?.city || null : null,
            deliveryZoneId: cart.zone?.id ?? null,
            notes: input.notes || null,
            subtotalCents: cart.subtotalCents,
            discountCents: cart.discountCents,
            deliveryFeeCents: cart.deliveryFeeCents,
            giftCardCents: cart.giftCardCents,
            totalCents: cart.totalCents,
            couponCode: cart.coupon?.code ?? null,
            giftCardId: cart.giftCardCents > 0 ? cart.giftCard?.id : null,
            requiresReview: cart.requiresReview,
            quoteRequestId: opts.quoteRequestId ?? null,
            marketingConsent: input.marketingConsent,
            acceptedTermsAt: new Date(),
            items: {
              create: cart.lines.map((l) => ({
                productId: l.productId,
                name: l.name,
                variantName: l.variantName,
                unitPriceCents: l.unitPriceCents,
                quantity: l.quantity,
                options: l.options as unknown as Prisma.InputJsonValue,
                dedication: l.dedication,
                referencePhotoUrl: l.referencePhotoUrl,
                isCustomCake: l.isCustomCake,
                customSpec: l.customSpec,
                lineTotalCents: l.lineTotalCents,
              })),
            },
            history: { create: { status: opts.status, note: "Pedido creado" } },
          },
          include: { items: true },
        });
      });
    } catch (error) {
      // Colisión improbable del número de pedido: se reintenta con otro
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new CheckoutError("No se pudo registrar el pedido, inténtalo de nuevo");
}
