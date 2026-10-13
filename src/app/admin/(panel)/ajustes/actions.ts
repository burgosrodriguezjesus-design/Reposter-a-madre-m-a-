"use server";

import { auditAdmin, requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { getSettings, saveSettings } from "@/lib/settings";
import { settingsSchemas, type SettingsSchemaKey } from "@/lib/settings-schemas";
import type { AllSettings } from "@/lib/settings-types";
import { saveImage, UploadError } from "@/lib/storage";
import { revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

const CAPACITY_KEYS = ["minLeadHours", "maxAdvanceDays", "slotMinutes", "maxOrdersPerSlot", "maxOrdersPerDay"];
const DELIVERY_KEYS = ["deliveryEnabled", "deliveryInfo"];

/** Permiso necesario según la sección y los campos que se cambian (mínimo privilegio). */
function permissionFor(key: SettingsSchemaKey, fields: string[]): Permission {
  if (key === "builder") return "catalog.manage";
  if (key === "marketing") return "marketing.manage";
  if (key === "ordering" && fields.length > 0 && fields.every((f) => CAPACITY_KEYS.includes(f))) return "calendar.manage";
  if (key === "ordering" && fields.length > 0 && fields.every((f) => DELIVERY_KEYS.includes(f))) return "delivery.manage";
  return "settings.manage";
}

/** Guarda una sección de ajustes (validada). Admite guardar solo algunos campos. */
export async function saveSettingsSection(key: SettingsSchemaKey, values: Record<string, unknown>): Promise<ActionResult> {
  // Los argumentos de una Server Action llegan del cliente: se validan siempre
  if (typeof key !== "string" || !Object.hasOwn(settingsSchemas, key) || typeof values !== "object" || values === null || Array.isArray(values)) {
    return { ok: false, error: "Sección no válida" };
  }
  const admin = await requirePermission(permissionFor(key, Object.keys(values)));
  const current = await getSettings();
  const merged = { ...current[key], ...values };
  const parsed = settingsSchemas[key].safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "Dato"}: ${issue?.message ?? "no válido"}` };
  }
  await saveSettings(key, parsed.data as AllSettings[typeof key]);
  const changed = Object.keys(values).filter((k) => JSON.stringify((current[key] as Record<string, unknown>)[k]) !== JSON.stringify(values[k]));
  await auditAdmin(admin, { action: "settings.update", entity: "Setting", entityId: key, details: { changed } });
  revalidateSite();
  return { ok: true, message: "Ajustes guardados" };
}

/** Sube una foto del negocio (portada o establecimiento). */
export async function uploadBusinessPhoto(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("settings.manage");
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
    await auditAdmin(admin, { action: "settings.photo_upload", entity: "Setting", entityId: "business", details: { target } });
    revalidateSite();
    return { ok: true, message: "Foto subida" };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    log.error("settings.photo_upload_failed", { error });
    return { ok: false, error: "No se pudo subir la foto" };
  }
}

export async function removeBusinessPhoto(formData: FormData) {
  const admin = await requirePermission("settings.manage");
  const target = str(formData, "target");
  const url = str(formData, "url");
  const { business } = await getSettings();
  if (target === "hero") await saveSettings("business", { ...business, heroImageUrl: "", heroImageAlt: "" });
  else await saveSettings("business", { ...business, storePhotos: business.storePhotos.filter((p) => p.url !== url) });
  await auditAdmin(admin, { action: "settings.photo_remove", entity: "Setting", entityId: "business", details: { target } });
  revalidateSite();
}

/** Elimina todo el contenido de demostración (productos, categorías vacías, zonas, cupones, promociones y opiniones de ejemplo). */
export async function deleteDemoData(): Promise<ActionResult> {
  const admin = await requirePermission("settings.manage");
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
  await auditAdmin(admin, { action: "catalog.demo_deleted", severity: "warning" });
  revalidateSite();
  return { ok: true, message: "Datos de demostración eliminados. ¡Ya puedes añadir tu catálogo real!" };
}
