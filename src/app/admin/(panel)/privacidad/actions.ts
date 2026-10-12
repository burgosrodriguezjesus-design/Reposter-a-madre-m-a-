"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { eraseSubjectData } from "@/lib/privacy";
import type { ActionResult } from "@/components/admin/forms";

export async function resolveRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("privacy.manage");
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const resolution = String(formData.get("resolution") ?? "").trim().slice(0, 1000);
  const request = await db.dataRequest.findUnique({ where: { id } });
  if (!request || request.status !== "VERIFIED") return { ok: false, error: "La solicitud no está pendiente o no se ha verificado" };

  if (intent === "erase") {
    const result = await eraseSubjectData(request.emailHash);
    await db.dataRequest.update({
      where: { id },
      data: { status: "COMPLETED", resolvedAt: new Date(), resolution: resolution || `Supresión ejecutada: ${result.anonymizedOrders} pedidos anonimizados` },
    });
    await auditAdmin(admin, { action: "privacy.erasure", entity: "DataRequest", entityId: id, severity: "warning", details: result });
    revalidatePath("/admin/privacidad");
    return {
      ok: true,
      message: `Hecho. ${result.anonymizedOrders} pedidos anonimizados, ${result.deleted.customers} ficha(s) y ${result.deleted.carts} carrito(s) borrados.${result.activeOrders ? ` Atención: ${result.activeOrders} pedido(s) en curso no se han tocado.` : ""}`,
    };
  }
  if (intent === "complete" || intent === "reject") {
    if (resolution.length < 5) return { ok: false, error: "Describe brevemente cómo se ha resuelto (queda registrado)" };
    await db.dataRequest.update({ where: { id }, data: { status: intent === "complete" ? "COMPLETED" : "REJECTED", resolvedAt: new Date(), resolution } });
    await auditAdmin(admin, { action: `privacy.request_${intent}`, entity: "DataRequest", entityId: id });
    revalidatePath("/admin/privacidad");
    return { ok: true, message: "Solicitud cerrada" };
  }
  return { ok: false, error: "Acción no válida" };
}
