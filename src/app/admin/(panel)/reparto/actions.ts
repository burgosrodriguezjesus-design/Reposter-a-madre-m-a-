"use server";

import { auditAdmin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/format";
import { bool, friendlyDbError, int, optionalInt, revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

export async function saveZone(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("delivery.manage");
  const id = str(formData, "id");
  const name = str(formData, "name", 80);
  const postalCodes = str(formData, "postalCodes", 2000)
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter((c) => /^\d{5}$/.test(c));
  if (name.length < 2) return { ok: false, error: "Escribe el nombre de la zona" };
  if (!postalCodes.length) return { ok: false, error: "Añade al menos un código postal de 5 cifras" };
  const data = {
    name,
    slug: slugify(str(formData, "slug", 80) || name),
    postalCodes: [...new Set(postalCodes)],
    feeCents: Math.max(0, int(formData, "feeCents")),
    minOrderCents: Math.max(0, int(formData, "minOrderCents")),
    freeFromCents: optionalInt(formData, "freeFromCents") || null,
    description: str(formData, "description", 6000),
    active: bool(formData, "active"),
    sortOrder: int(formData, "sortOrder"),
    isDemo: false,
  };
  try {
    const before = id ? await db.deliveryZone.findUnique({ where: { id }, select: { feeCents: true, minOrderCents: true, freeFromCents: true } }) : null;
    const saved = id ? await db.deliveryZone.update({ where: { id }, data }) : await db.deliveryZone.create({ data });
    await auditAdmin(admin, {
      action: id ? "delivery.zone_update" : "delivery.zone_create",
      entity: "DeliveryZone",
      entityId: saved.id,
      details: { name, before, after: { feeCents: data.feeCents, minOrderCents: data.minOrderCents, freeFromCents: data.freeFromCents } },
    });
    revalidateSite();
    return { ok: true, message: id ? "Zona guardada" : "Zona creada" };
  } catch (error) {
    return { ok: false, error: friendlyDbError(error) };
  }
}

export async function deleteZone(formData: FormData) {
  const admin = await requirePermission("delivery.manage");
  const id = str(formData, "id");
  await auditAdmin(admin, { action: "delivery.zone_delete", entity: "DeliveryZone", entityId: id });
  const used = await db.order.count({ where: { deliveryZoneId: id } });
  if (used) await db.deliveryZone.update({ where: { id }, data: { active: false } });
  else await db.deliveryZone.delete({ where: { id } });
  revalidateSite();
}
