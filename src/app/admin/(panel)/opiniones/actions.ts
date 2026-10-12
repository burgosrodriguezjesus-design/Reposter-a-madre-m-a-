"use server";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

export async function moderateReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData, "id");
  const intent = str(formData, "intent");
  const reply = str(formData, "reply", 1000);
  if (intent === "delete") {
    await db.review.delete({ where: { id } });
  } else if (intent === "approve" || intent === "hide") {
    await db.review.update({ where: { id }, data: { status: intent === "approve" ? "APPROVED" : "HIDDEN", reply: reply || null } });
  } else {
    await db.review.update({ where: { id }, data: { reply: reply || null } });
  }
  revalidateSite();
  return { ok: true, message: intent === "approve" ? "Publicada" : intent === "hide" ? "Ocultada" : intent === "delete" ? "Eliminada" : "Respuesta guardada" };
}
