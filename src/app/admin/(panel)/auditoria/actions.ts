"use server";

import { auditAdmin, requirePermission } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/audit";
import { securityAlert } from "@/lib/alerts";
import { revalidatePath } from "next/cache";
import { retryJob } from "@/lib/jobs";
import { kickJobs } from "@/lib/job-handlers";

export async function verifyChain(): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePermission("audit.view");
  const result = await verifyAuditChain();
  await auditAdmin(admin, { action: "audit.verified", details: { ok: result.ok, checked: result.checked, brokenAtSeq: result.brokenAtSeq ?? null } });
  if (!result.ok) {
    await securityAlert("audit.chain_broken", "La cadena del registro de auditoría no es íntegra: posible manipulación.", { brokenAtSeq: result.brokenAtSeq ?? null }, { severity: "critical" });
    return { ok: false, message: `⚠ Registro manipulado o dañado a partir de la entrada nº ${result.brokenAtSeq}. Se ha enviado una alerta.` };
  }
  return { ok: true, message: `✓ Íntegro: ${result.checked} entradas verificadas. Huella actual: ${result.head?.slice(0, 16) ?? "—"}…` };
}

/** Vuelve a poner en cola un trabajo fallido definitivamente (emails, avisos, alertas). */
export async function retryFailedJob(formData: FormData) {
  const admin = await requirePermission("audit.view");
  const id = String(formData.get("id") ?? "").slice(0, 40);
  if (!id) return;
  await retryJob(id);
  await auditAdmin(admin, { action: "jobs.retried", entity: "Job", entityId: id });
  kickJobs();
  revalidatePath("/admin/auditoria");
}
