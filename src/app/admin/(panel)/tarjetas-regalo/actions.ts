"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailHash } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { giftCardCode } from "@/lib/ids";
import { activateGiftCard } from "@/lib/order-events";
import { enqueue } from "@/lib/jobs";
import { kickJobs } from "@/lib/job-handlers";
import { bool, int, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

/** Tarjeta vendida en la tienda: se crea ya activa. */
export async function createGiftCard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("giftcards.manage");
  const amount = int(formData, "amountCents");
  const purchaserName = str(formData, "purchaserName", 80);
  const purchaserEmail = str(formData, "purchaserEmail", 160).toLowerCase();
  if (amount < 100 || amount > 100_000) return { ok: false, error: "Indica un importe entre 1 y 1.000 €" };
  if (purchaserName.length < 2) return { ok: false, error: "Indica el nombre del comprador" };
  const settings = await getSettings();
  for (let i = 0; i < 4; i++) {
    try {
      const card = await db.giftCard.create({
        data: {
          code: giftCardCode(),
          initialCents: amount,
          balanceCents: amount,
          status: "ACTIVE",
          purchaserName,
          purchaserEmail,
          purchaserEmailHash: purchaserEmail ? emailHash(purchaserEmail) : "",
          recipientName: str(formData, "recipientName", 80) || null,
          recipientEmail: str(formData, "recipientEmail", 160).toLowerCase() || null,
          message: str(formData, "message", 300) || null,
          paymentMethod: "IN_STORE",
          expiresAt: new Date(Date.now() + settings.marketing.giftCardValidityMonths * 30.5 * 86_400_000),
        },
      });
      await auditAdmin(admin, { action: "giftcard.create", entity: "GiftCard", entityId: card.id, severity: "warning", details: { amount } });
      if (bool(formData, "sendEmail") && purchaserEmail) {
        await enqueue("email.send", { template: "giftcard", giftCardId: card.id }, { dedupeKey: `email:giftcard:${card.id}` });
        kickJobs();
      }
      revalidatePath("/admin/tarjetas-regalo");
      return { ok: true, message: `Tarjeta creada: ${card.code}` };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { ok: false, error: "Inténtalo de nuevo" };
}

export async function updateGiftCard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requirePermission("giftcards.manage");
  const id = str(formData, "id");
  const intent = str(formData, "intent");
  const card = await db.giftCard.findUnique({ where: { id } });
  if (!card) return { ok: false, error: "Tarjeta no encontrada" };
  if (intent === "activate") {
    await activateGiftCard(id, "IN_STORE");
    kickJobs();
    await auditAdmin(admin, { action: "giftcard.activate", entity: "GiftCard", entityId: id, severity: "warning" });
    revalidatePath("/admin/tarjetas-regalo");
    return { ok: true, message: "Tarjeta activada y enviada por email" };
  }
  if (intent === "cancel") {
    await db.giftCard.update({ where: { id }, data: { status: "CANCELLED" } });
    await auditAdmin(admin, { action: "giftcard.cancel", entity: "GiftCard", entityId: id, severity: "warning" });
  } else if (intent === "balance") {
    // El saldo nunca puede superar el importe inicial (también lo impide la base de datos)
    const balance = Math.min(card.initialCents, Math.max(0, int(formData, "balanceCents")));
    await db.giftCard.update({ where: { id }, data: { balanceCents: balance, status: balance > 0 ? "ACTIVE" : "DEPLETED" } });
    await auditAdmin(admin, { action: "giftcard.balance_change", entity: "GiftCard", entityId: id, severity: "warning", details: { before: card.balanceCents, after: balance } });
  }
  revalidatePath("/admin/tarjetas-regalo");
  return { ok: true, message: "Tarjeta actualizada" };
}
