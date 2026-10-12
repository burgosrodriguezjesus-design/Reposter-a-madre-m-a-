"use server";

import { auditAdmin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveImage, UploadError } from "@/lib/storage";
import { bool, dateOrNull, friendlyDbError, int, optionalInt, revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

export async function savePromotion(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("marketing.manage");
  const id = str(formData, "id");
  const title = str(formData, "title", 120);
  if (title.length < 3) return { ok: false, error: "Escribe un título" };
  const ctaHref = str(formData, "ctaHref", 300);
  if (ctaHref && !ctaHref.startsWith("/") && !/^https:\/\//.test(ctaHref)) return { ok: false, error: "El enlace debe empezar por / o https://" };
  try {
    const file = formData.get("image");
    const imageUrl = file instanceof File && file.size > 0 ? (await saveImage(file, "site", 900)).url : undefined;
    const data = {
      title,
      description: str(formData, "description", 500),
      badge: str(formData, "badge", 30) || null,
      ctaLabel: str(formData, "ctaLabel", 40) || null,
      ctaHref: ctaHref || null,
      startsAt: dateOrNull(formData, "startsAt"),
      endsAt: dateOrNull(formData, "endsAt", true),
      active: bool(formData, "active"),
      sortOrder: int(formData, "sortOrder"),
      isDemo: false,
      ...(imageUrl ? { imageUrl } : {}),
    };
    const saved = id ? await db.promotion.update({ where: { id }, data }) : await db.promotion.create({ data });
    await auditAdmin(admin, { action: id ? "promotion.update" : "promotion.create", entity: "Promotion", entityId: saved.id, details: { title } });
    revalidateSite();
    return { ok: true, message: "Promoción guardada" };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: friendlyDbError(error) };
  }
}

export async function deletePromotion(formData: FormData) {
  const admin = await requirePermission("marketing.manage");
  const id = str(formData, "id");
  await db.promotion.delete({ where: { id } });
  await auditAdmin(admin, { action: "promotion.delete", entity: "Promotion", entityId: id });
  revalidateSite();
}

export async function saveCoupon(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("marketing.manage");
  const id = str(formData, "id");
  const code = str(formData, "code", 30).toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return { ok: false, error: "El código solo admite letras, números y guiones (3-30)" };
  const type = str(formData, "type") as "PERCENT" | "FIXED" | "FREE_DELIVERY";
  if (!["PERCENT", "FIXED", "FREE_DELIVERY"].includes(type)) return { ok: false, error: "Tipo no válido" };
  const value = type === "PERCENT" ? int(formData, "percent") : type === "FIXED" ? int(formData, "amountCents") : 0;
  if (type === "PERCENT" && (value < 1 || value > 100)) return { ok: false, error: "El porcentaje debe estar entre 1 y 100" };
  if (type === "FIXED" && (value < 1 || value > 100_000)) return { ok: false, error: "Indica el importe del descuento (máx. 1.000 €)" };
  const data = {
    code,
    description: str(formData, "description", 200),
    type,
    value,
    minOrderCents: Math.max(0, int(formData, "minOrderCents")),
    startsAt: dateOrNull(formData, "startsAt"),
    endsAt: dateOrNull(formData, "endsAt", true),
    maxRedemptions: optionalInt(formData, "maxRedemptions"),
    active: bool(formData, "active"),
    isDemo: false,
  };
  try {
    const saved = id ? await db.coupon.update({ where: { id }, data }) : await db.coupon.create({ data });
    await auditAdmin(admin, { action: id ? "coupon.update" : "coupon.create", entity: "Coupon", entityId: saved.id, severity: "warning", details: { code, type, value, maxRedemptions: data.maxRedemptions, active: data.active } });
    return { ok: true, message: "Cupón guardado" };
  } catch (error) {
    return { ok: false, error: friendlyDbError(error) };
  }
}

export async function deleteCoupon(formData: FormData) {
  const admin = await requirePermission("marketing.manage");
  const id = str(formData, "id");
  const coupon = await db.coupon.findUnique({ where: { id } });
  if (!coupon) return;
  if (coupon.redemptions > 0) await db.coupon.update({ where: { id }, data: { active: false } });
  else await db.coupon.delete({ where: { id } });
  await auditAdmin(admin, { action: "coupon.delete", entity: "Coupon", entityId: id, details: { code: coupon.code } });
}
