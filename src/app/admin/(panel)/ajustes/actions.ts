"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdmin, hashPassword, requireAdmin, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { settingsSchemas, type SettingsSchemaKey } from "@/lib/settings-schemas";
import type { AllSettings } from "@/lib/settings-types";
import { saveImage, UploadError } from "@/lib/storage";
import { revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

/** Guarda una sección de ajustes (validada). Admite guardar solo algunos campos. */
export async function saveSettingsSection(key: SettingsSchemaKey, values: Record<string, unknown>): Promise<ActionResult> {
  await requireAdmin();
  const current = await getSettings();
  const merged = { ...current[key], ...values };
  const parsed = settingsSchemas[key].safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "Dato"}: ${issue?.message ?? "no válido"}` };
  }
  await saveSettings(key, parsed.data as AllSettings[typeof key]);
  revalidateSite();
  return { ok: true, message: "Ajustes guardados" };
}

/** Sube una foto del negocio (portada o establecimiento). */
export async function uploadBusinessPhoto(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const target = str(formData, "target");
  const alt = str(formData, "alt", 200);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige una foto" };
  if (alt.length < 3) return { ok: false, error: "Describe brevemente la foto" };
  try {
    const image = await saveImage(file, "site", 2000);
    const { business } = await getSettings();
    if (target === "hero") await saveSettings("business", { ...business, heroImageUrl: image.url, heroImageAlt: alt });
    else await saveSettings("business", { ...business, storePhotos: [...business.storePhotos, { url: image.url, alt }].slice(0, 12) });
    revalidateSite();
    return { ok: true, message: "Foto subida" };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "No se pudo subir la foto" };
  }
}

export async function removeBusinessPhoto(formData: FormData) {
  await requireAdmin();
  const target = str(formData, "target");
  const url = str(formData, "url");
  const { business } = await getSettings();
  if (target === "hero") await saveSettings("business", { ...business, heroImageUrl: "", heroImageAlt: "" });
  else await saveSettings("business", { ...business, storePhotos: business.storePhotos.filter((p) => p.url !== url) });
  revalidateSite();
}

const passwordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(10, "La nueva contraseña debe tener al menos 10 caracteres").max(200),
});

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = passwordSchema.safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const user = await db.adminUser.findUnique({ where: { id: admin.id } });
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) return { ok: false, error: "La contraseña actual no es correcta" };
  await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: true, message: "Contraseña actualizada" };
}

const newAdminSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Mínimo 10 caracteres").max(200),
});

export async function addAdminUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = newAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const exists = await db.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { ok: false, error: "Ya existe un usuario con ese email" };
  await db.adminUser.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) } });
  return { ok: true, message: "Usuario creado. Comparte la contraseña de forma segura." };
}

export async function removeAdminUser(formData: FormData) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const id = str(formData, "id");
  if (id !== admin.id && (await db.adminUser.count()) > 1) await db.adminUser.delete({ where: { id } });
  redirect("/admin/ajustes#cuenta");
}

/** Elimina todo el contenido de demostración (productos, categorías vacías, zonas, cupones, promociones y opiniones de ejemplo). */
export async function deleteDemoData(): Promise<ActionResult> {
  await requireAdmin();
  const demoProducts = await db.product.findMany({ where: { isDemo: true }, select: { id: true, _count: { select: { orderItems: true } } } });
  const used = demoProducts.filter((p) => p._count.orderItems > 0).map((p) => p.id);
  const unused = demoProducts.filter((p) => p._count.orderItems === 0).map((p) => p.id);
  await db.$transaction([
    db.product.updateMany({ where: { id: { in: used } }, data: { archived: true, active: false, isDemo: false } }),
    db.product.deleteMany({ where: { id: { in: unused } } }),
    db.review.deleteMany({ where: { isDemo: true } }),
    db.promotion.deleteMany({ where: { isDemo: true } }),
    db.coupon.deleteMany({ where: { isDemo: true, redemptions: 0 } }),
    db.coupon.updateMany({ where: { isDemo: true }, data: { active: false, isDemo: false } }),
    db.deliveryZone.updateMany({ where: { isDemo: true, orders: { some: {} } }, data: { active: false, isDemo: false } }),
    db.deliveryZone.deleteMany({ where: { isDemo: true, orders: { none: {} } } }),
  ]);
  // Categorías de demo: se borran las que quedan vacías; las que tienen productos reales se conservan
  await db.category.deleteMany({ where: { isDemo: true, products: { none: {} } } });
  await db.category.updateMany({ where: { isDemo: true }, data: { isDemo: false } });
  revalidateSite();
  return { ok: true, message: "Datos de demostración eliminados. ¡Ya puedes añadir tu catálogo real!" };
}
