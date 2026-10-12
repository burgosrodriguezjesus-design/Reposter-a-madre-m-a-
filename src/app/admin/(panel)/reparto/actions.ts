"use server";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/format";
import { bool, friendlyDbError, int, optionalInt, revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

export async function saveZone(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
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
    if (id) await db.deliveryZone.update({ where: { id }, data });
    else await db.deliveryZone.create({ data });
    revalidateSite();
    return { ok: true, message: id ? "Zona guardada" : "Zona creada" };
  } catch (error) {
    return { ok: false, error: friendlyDbError(error) };
  }
}

export async function deleteZone(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const used = await db.order.count({ where: { deliveryZoneId: id } });
  if (used) await db.deliveryZone.update({ where: { id }, data: { active: false } });
  else await db.deliveryZone.delete({ where: { id } });
  revalidateSite();
}
