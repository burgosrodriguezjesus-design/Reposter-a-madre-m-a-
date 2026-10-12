"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidateSite, str } from "@/lib/admin";
import { isValidDate } from "@/lib/availability";
import type { ActionResult } from "@/components/admin/forms";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)");
const hoursSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), opensAt: time, closesAt: time }))
  .max(50)
  .refine((rows) => rows.every((r) => r.opensAt < r.closesAt), "La hora de cierre debe ser posterior a la de apertura");

export async function saveOpeningHours(rows: { weekday: number; opensAt: string; closesAt: string }[]): Promise<ActionResult> {
  await requireAdmin();
  const parsed = hoursSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await db.$transaction([db.openingHour.deleteMany(), db.openingHour.createMany({ data: parsed.data })]);
  revalidateSite();
  return { ok: true, message: "Horario guardado" };
}

export async function addBlockedDate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate") || startDate;
  const reason = str(formData, "reason", 120);
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return { ok: false, error: "Revisa las fechas" };
  const affected = await db.order.count({
    where: { scheduledDate: { gte: startDate, lte: endDate }, status: { in: ["PENDING", "ACCEPTED", "IN_PREPARATION", "READY"] } },
  });
  await db.blockedDate.create({ data: { startDate, endDate, reason: reason || "Cerrado" } });
  revalidatePath("/admin/calendario");
  return {
    ok: true,
    message: affected ? `Días bloqueados. Atención: ya hay ${affected} pedido(s) en esas fechas; revísalos.` : "Días bloqueados",
  };
}

export async function removeBlockedDate(formData: FormData) {
  await requireAdmin();
  await db.blockedDate.delete({ where: { id: str(formData, "id") } });
  revalidatePath("/admin/calendario");
}
