"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
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
  const admin = await requirePermission("orders.update");
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos no válidos" };
  const { orderId, status, note, notify, refund } = parsed.data;
  // Cancelar/rechazar y reembolsar requieren permisos adicionales (comprobados en el servidor)
  if ((status === "CANCELLED" || status === "REJECTED") && !can(admin.role, "orders.cancel")) await requirePermission("orders.cancel");
  if (refund === "on" && !can(admin.role, "orders.refund")) await requirePermission("orders.refund");
  const result = await changeOrderStatus(orderId, status, {
    note: note || null,
    notifyCustomer: notify === "on",
    refund: refund === "on",
    actor: { id: admin.id, email: admin.email },
  });
  await auditAdmin(admin, {
    action: "order.status_change",
    entity: "Order",
    entityId: orderId,
    severity: status === "CANCELLED" || status === "REJECTED" || refund === "on" ? "warning" : "info",
    details: { status, refund: refund === "on", ok: result.ok },
  });
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin", "layout");
  return result.ok ? { ok: true, message: "Estado actualizado" + (notify === "on" ? " y cliente avisado por email" : "") } : result;
}

export async function markOrderAsPaid(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("orders.payment");
  const orderId = String(formData.get("orderId") ?? "");
  const order = await db.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true, paymentMethod: true } });
  if (!order) return { ok: false, error: "Pedido no encontrado" };
  // Los pagos con tarjeta solo los confirma Stripe (webhook firmado); nunca a mano.
  if (order.paymentMethod !== "IN_STORE") return { ok: false, error: "Los pagos online se confirman automáticamente con Stripe" };
  const next = order.paymentStatus === "PAID" ? "UNPAID" : "PAID";
  const { count } = await db.order.updateMany({ where: { id: orderId, paymentStatus: order.paymentStatus }, data: { paymentStatus: next } });
  if (count === 0) return { ok: false, error: "El pedido ha cambiado; recarga la página" };
  await auditAdmin(admin, { action: "order.payment_manual", entity: "Order", entityId: orderId, severity: "warning", details: { before: order.paymentStatus, after: next } });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: order.paymentStatus === "PAID" ? "Marcado como pendiente de pago" : "Marcado como pagado" };
}

export async function saveAdminNotes(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("orders.update");
  const orderId = String(formData.get("orderId") ?? "");
  const notes = String(formData.get("adminNotes") ?? "").slice(0, 4000);
  await db.order.update({ where: { id: orderId }, data: { adminNotes: notes || null } });
  await auditAdmin(admin, { action: "order.notes_update", entity: "Order", entityId: orderId });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: "Notas guardadas" };
}
