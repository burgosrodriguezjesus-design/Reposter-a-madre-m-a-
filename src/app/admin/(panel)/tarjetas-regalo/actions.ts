"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { giftCardCode } from "@/lib/ids";
import { activateGiftCard } from "@/lib/order-events";
import { sendEmail } from "@/lib/email";
import { giftCardEmails } from "@/lib/emails";
import { bool, int, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

/** Tarjeta vendida en la tienda: se crea ya activa. */
export async function createGiftCard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const amount = int(formData, "amountCents");
  const purchaserName = str(formData, "purchaserName", 80);
  const purchaserEmail = str(formData, "purchaserEmail", 160).toLowerCase();
  if (amount < 100) return { ok: false, error: "Indica el importe" };
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
          recipientName: str(formData, "recipientName", 80) || null,
          recipientEmail: str(formData, "recipientEmail", 160).toLowerCase() || null,
          message: str(formData, "message", 300) || null,
          paymentMethod: "IN_STORE",
          expiresAt: new Date(Date.now() + settings.marketing.giftCardValidityMonths * 30.5 * 86_400_000),
        },
      });
      if (bool(formData, "sendEmail") && purchaserEmail) for (const m of giftCardEmails(card, settings)) await sendEmail(m);
      revalidatePath("/admin/tarjetas-regalo");
      return { ok: true, message: `Tarjeta creada: ${card.code}` };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { ok: false, error: "Inténtalo de nuevo" };
}

export async function updateGiftCard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData, "id");
  const intent = str(formData, "intent");
  const card = await db.giftCard.findUnique({ where: { id } });
  if (!card) return { ok: false, error: "Tarjeta no encontrada" };
  if (intent === "activate") {
    await activateGiftCard(id, "IN_STORE");
    revalidatePath("/admin/tarjetas-regalo");
    return { ok: true, message: "Tarjeta activada y enviada por email" };
  }
  if (intent === "cancel") {
    await db.giftCard.update({ where: { id }, data: { status: "CANCELLED" } });
  } else if (intent === "balance") {
    const balance = Math.max(0, int(formData, "balanceCents"));
    await db.giftCard.update({ where: { id }, data: { balanceCents: balance, status: balance > 0 ? "ACTIVE" : "DEPLETED" } });
  }
  revalidatePath("/admin/tarjetas-regalo");
  return { ok: true, message: "Tarjeta actualizada" };
}
