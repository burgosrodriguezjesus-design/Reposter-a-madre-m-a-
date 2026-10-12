"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { kickJobs } from "@/lib/job-handlers";
import type { ActionResult } from "@/components/admin/forms";

export async function answerQuote(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("quotes.manage");
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000);
  const quote = await db.quoteRequest.findUnique({ where: { id } });
  if (!quote) return { ok: false, error: "Presupuesto no encontrado" };
  if (quote.status === "ACCEPTED") return { ok: false, error: "El cliente ya aceptó este presupuesto" };

  if (decision === "quote") {
    const cents = Number(formData.get("quotedCents"));
    if (!Number.isInteger(cents) || cents < 100 || cents > 1_000_000) return { ok: false, error: "Indica un precio válido" };
    const updated = await db.quoteRequest.update({ where: { id }, data: { status: "QUOTED", quotedCents: cents, adminMessage: message || null } });
    await auditAdmin(admin, { action: "quote.priced", entity: "QuoteRequest", entityId: id, details: { before: quote.quotedCents, after: cents } });
    await enqueue("email.send", { template: "quote-answered", quoteId: id }, { dedupeKey: `email:quote-answered:${id}:${updated.status}:${cents}` });
    kickJobs();
    revalidatePath(`/admin/presupuestos/${id}`);
    return { ok: true, message: "Presupuesto enviado al cliente por email" };
  }
  if (decision === "reject") {
    const updated = await db.quoteRequest.update({ where: { id }, data: { status: "REJECTED", adminMessage: message || null } });
    await auditAdmin(admin, { action: "quote.rejected", entity: "QuoteRequest", entityId: id });
    await enqueue("email.send", { template: "quote-answered", quoteId: id }, { dedupeKey: `email:quote-answered:${id}:${updated.status}` });
    kickJobs();
    revalidatePath(`/admin/presupuestos/${id}`);
    return { ok: true, message: "Solicitud rechazada y cliente avisado" };
  }
  if (decision === "expire") {
    await db.quoteRequest.update({ where: { id }, data: { status: "EXPIRED" } });
    await auditAdmin(admin, { action: "quote.expired", entity: "QuoteRequest", entityId: id });
    revalidatePath(`/admin/presupuestos/${id}`);
    return { ok: true, message: "Marcado como caducado" };
  }
  return { ok: false, error: "Acción no válida" };
}
