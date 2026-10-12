"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ALLERGEN_KEYS, OCCASIONS } from "@/lib/allergens";
import { deleteImage, saveImage, UploadError } from "@/lib/storage";
import { friendlyDbError, revalidateSite } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

const money = z.number().int().min(0).max(10_000_000);
const text = (max: number) => z.string().trim().max(max);

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "La URL solo puede tener minúsculas, números y guiones"),
  categoryId: z.string().min(1, "Elige una categoría"),
  shortDescription: text(240),
  description: text(6000),
  priceCents: money,
  variants: z
    .array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), servings: text(80).optional(), priceCents: money }))
    .max(15),
  optionGroups: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(80),
        required: z.boolean(),
        multiple: z.boolean(),
        choices: z.array(z.object({ id: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(80), priceDeltaCents: z.number().int().min(-1_000_000).max(1_000_000) })).min(1).max(20),
      }),
    )
    .max(10),
  ingredients: text(3000),
  allergens: z.array(z.string()).transform((a) => a.filter((k) => ALLERGEN_KEYS.includes(k))),
  mayContain: z.array(z.string()).transform((a) => a.filter((k) => ALLERGEN_KEYS.includes(k))),
  occasions: z.array(z.string()).transform((a) => a.filter((k) => OCCASIONS.some((o) => o.key === k))),
  allowDedication: z.boolean(),
  allowReferencePhoto: z.boolean(),
  availability: z.enum(["AVAILABLE", "ON_DEMAND", "SEASONAL", "SOLD_OUT"]),
  leadTimeHours: z.number().int().min(0).max(24 * 120),
  maxPerOrder: z.number().int().min(1).max(50),
  featured: z.boolean(),
  isNew: z.boolean(),
  active: z.boolean(),
  popularityBoost: z.number().int().min(-100).max(100),
  seoTitle: text(70).optional(),
  seoDescription: text(170).optional(),
});

export type ProductPayload = z.input<typeof productSchema>;

export async function saveProduct(payload: ProductPayload): Promise<ActionResult & { id?: string }> {
  await requireAdmin();
  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const { id, variants, optionGroups, seoTitle, seoDescription, ...data } = parsed.data;
  const common = { ...data, optionGroups, seoTitle: seoTitle || null, seoDescription: seoDescription || null, isDemo: false };

  try {
    let productId = id;
    await db.$transaction(async (tx) => {
      if (productId) {
        await tx.product.update({ where: { id: productId }, data: common });
        const keep = variants.filter((v) => v.id).map((v) => v.id!);
        await tx.productVariant.deleteMany({ where: { productId, id: { notIn: keep } } });
      } else {
        const created = await tx.product.create({ data: common });
        productId = created.id;
      }
      for (const [i, v] of variants.entries()) {
        const row = { name: v.name, servings: v.servings || null, priceCents: v.priceCents, sortOrder: i };
        if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: row });
        else await tx.productVariant.create({ data: { ...row, productId: productId! } });
      }
    });
    revalidateSite();
    return { ok: true, message: "Producto guardado", id: productId };
  } catch (error) {
    return { ok: false, error: friendlyDbError(error) };
  }
}

export async function uploadProductImages(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const product = await db.product.findUnique({ where: { id: productId }, include: { images: true } });
  if (!product) return { ok: false, error: "Producto no encontrado" };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Elige al menos una foto" };
  try {
    let order = product.images.length;
    for (const file of files.slice(0, 8)) {
      const img = await saveImage(file, "products", 1800);
      await db.productImage.create({
        data: { productId, url: img.url, width: img.width, height: img.height, alt: product.name, sortOrder: order++ },
      });
    }
    await db.product.update({ where: { id: productId }, data: { isDemo: false } });
    revalidateSite();
    return { ok: true, message: `${Math.min(files.length, 8)} foto(s) subida(s). Revisa el texto alternativo.` };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: friendlyDbError(error, "No se pudo subir la foto") };
  }
}

export async function updateProductImage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("imageId") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  const image = await db.productImage.findUnique({ where: { id } });
  if (!image) return { ok: false, error: "Foto no encontrada" };

  if (intent === "delete") {
    await db.productImage.delete({ where: { id } });
    if (!image.url.startsWith("/demo/")) await deleteImage(image.url);
  } else if (intent === "first") {
    const images = await db.productImage.findMany({ where: { productId: image.productId }, orderBy: { sortOrder: "asc" } });
    const ordered = [image, ...images.filter((i) => i.id !== id)];
    await db.$transaction(ordered.map((img, i) => db.productImage.update({ where: { id: img.id }, data: { sortOrder: i } })));
  } else {
    const alt = String(formData.get("alt") ?? "").trim().slice(0, 200);
    if (alt.length < 3) return { ok: false, error: "Describe la foto (texto alternativo para Google y accesibilidad)" };
    await db.productImage.update({ where: { id }, data: { alt } });
  }
  revalidateSite();
  return { ok: true, message: intent === "delete" ? "Foto eliminada" : "Guardado" };
}

export async function deleteProduct(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const used = await db.orderItem.count({ where: { productId: id } });
  if (used > 0) {
    // Tiene pedidos: se archiva para conservar el historial
    await db.product.update({ where: { id }, data: { archived: true, active: false } });
  } else {
    const images = await db.productImage.findMany({ where: { productId: id } });
    await db.product.delete({ where: { id } });
    for (const img of images) if (!img.url.startsWith("/demo/")) await deleteImage(img.url);
  }
  revalidateSite();
  redirect("/admin/productos");
}

export async function toggleProductActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const product = await db.product.findUnique({ where: { id } });
  if (product) await db.product.update({ where: { id }, data: { active: !product.active, archived: false } });
  revalidateSite();
}
