"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { changeOrderStatus } from "@/lib/order-events";
import type { ActionResult } from "@/components/admin/forms";

const statusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["ACCEPTED", "IN_PREPARATION", "READY", "DELIVERED", "REJECTED", "CANCELLED"]),
  note: z.string().trim().max(1000).optional(),
  notify: z.string().optional(),
  refund: z.string().optional(),
});

export async function updateOrderStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos no válidos" };
  const { orderId, status, note, notify, refund } = parsed.data;
  const result = await changeOrderStatus(orderId, status, {
    note: note || null,
    notifyCustomer: notify === "on",
    refund: refund === "on",
  });
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin", "layout");
  return result.ok ? { ok: true, message: "Estado actualizado" + (notify === "on" ? " y cliente avisado por email" : "") } : result;
}

export async function markOrderAsPaid(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Pedido no encontrado" };
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: order.paymentStatus === "PAID" ? "UNPAID" : "PAID" } });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: order.paymentStatus === "PAID" ? "Marcado como pendiente de pago" : "Marcado como pagado" };
}

export async function saveAdminNotes(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const notes = String(formData.get("adminNotes") ?? "").slice(0, 4000);
  await db.order.update({ where: { id: orderId }, data: { adminNotes: notes || null } });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: "Notas guardadas" };
}
