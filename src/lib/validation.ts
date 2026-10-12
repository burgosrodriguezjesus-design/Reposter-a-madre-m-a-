import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);

export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Introduce un teléfono válido")
  .max(20)
  .regex(/^[+\d][\d\s().-]{7,}$/, "Introduce un teléfono válido");

export const emailSchema = z.string().trim().toLowerCase().max(160).email("Introduce un email válido");

export const customCakeSpecSchema = z.object({
  celebration: trimmed(60),
  sizeId: trimmed(40),
  spongeId: trimmed(40),
  fillingId: trimmed(40),
  coveringId: trimmed(40),
  colorIds: z.array(trimmed(40)).max(10),
  decorationIds: z.array(trimmed(40)).max(20),
  text: trimmed(120),
});

export const cartItemSchema = z.object({
  kind: z.enum(["product", "custom"]),
  productId: trimmed(40).optional(),
  variantId: trimmed(40).nullable().optional(),
  quantity: z.number().int().min(1).max(50),
  options: z.record(z.string().max(40), z.array(z.string().max(40)).max(20)).optional(),
  dedication: trimmed(120).optional(),
  referencePhotoUrl: trimmed(500).optional(),
  spec: customCakeSpecSchema.optional(),
});

export const checkoutBaseSchema = z.object({
  items: z.array(cartItemSchema).min(1, "El carrito está vacío").max(30),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]),
  postalCode: trimmed(10).optional(),
  couponCode: trimmed(40).optional(),
  giftCardCode: trimmed(40).optional(),
});

export const createOrderSchema = checkoutBaseSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elige una hora"),
  customer: z.object({
    name: z.string().trim().min(2, "Introduce tu nombre").max(80),
    email: emailSchema,
    phone: phoneSchema,
  }),
  address: z
    .object({
      street: trimmed(200),
      city: trimmed(80),
      details: trimmed(300).optional(),
    })
    .optional(),
  notes: trimmed(1000).optional(),
  paymentMethod: z.enum(["CARD", "IN_STORE"]),
  acceptTerms: z.literal(true, { error: "Debes aceptar las condiciones de compra" }),
  marketingConsent: z.boolean().default(false),
  /** Campo trampa anti-spam: debe llegar vacío */
  website: z.string().max(0).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const quoteRequestSchema = z.object({
  spec: customCakeSpecSchema,
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]),
  customer: z.object({
    name: z.string().trim().min(2, "Introduce tu nombre").max(80),
    email: emailSchema,
    phone: phoneSchema,
  }),
  notes: trimmed(2000).optional(),
  referencePhotoUrl: trimmed(500).optional(),
  acceptPrivacy: z.literal(true, { error: "Debes aceptar la política de privacidad" }),
  website: z.string().max(0).optional(),
});

export const reviewSchema = z.object({
  authorName: z.string().trim().min(2, "Introduce tu nombre").max(60),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(15, "Cuéntanos un poco más (mínimo 15 caracteres)").max(1500),
  orderNumber: trimmed(20).optional(),
  email: z.union([emailSchema, z.literal("")]).optional(),
  acceptPrivacy: z.literal(true, { error: "Debes aceptar la política de privacidad" }),
  website: z.string().max(0).optional(),
});

export const giftCardPurchaseSchema = z.object({
  amountCents: z.number().int().min(500).max(50000),
  purchaserName: z.string().trim().min(2).max(80),
  purchaserEmail: emailSchema,
  recipientName: trimmed(80).optional(),
  recipientEmail: z.union([emailSchema, z.literal("")]).optional(),
  message: trimmed(300).optional(),
  paymentMethod: z.enum(["CARD", "IN_STORE"]),
  acceptTerms: z.literal(true, { error: "Debes aceptar las condiciones" }),
  website: z.string().max(0).optional(),
});

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}
