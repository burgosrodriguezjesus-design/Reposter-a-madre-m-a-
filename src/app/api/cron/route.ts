import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/http";
import { applyRetention } from "@/lib/privacy";
import { verifyAuditChain } from "@/lib/audit";
import { securityAlert } from "@/lib/alerts";
import { kickJobs } from "@/lib/job-handlers";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { abandonedCartEmail, reminderEmail } from "@/lib/emails";
import { addDays, localNow } from "@/lib/availability";
import { formatLocalDate } from "@/lib/format";

/**
 * Tareas programadas (idempotentes). Vercel Cron la llama con
 * "Authorization: Bearer CRON_SECRET". Recomendado: cada hora (o al menos a diario).
 *  1. Revisa pagos pendientes caducados.
 *  2. Envía UN recordatorio de carrito a quien lo autorizó.
 *  3. Envía los recordatorios de celebraciones.
 *  4. Aplica los plazos de conservación (anonimización y borrado, RGPD).
 *  5. Verifica el registro de auditoría y envía su huella fuera del sistema.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const settings = await getSettings();
  const report = { cartEmails: 0, reminders: 0 };

  // 2. Recordatorio de carrito (una sola vez, solo con consentimiento)
  if (settings.marketing.abandonedCartEnabled) {
    const carts = await db.abandonedCart.findMany({
      where: {
        recoveredAt: null,
        emailSentAt: null,
        updatedAt: {
          lt: new Date(Date.now() - settings.marketing.abandonedCartDelayHours * 3600_000),
          gt: new Date(Date.now() - 7 * 86_400_000),
        },
      },
      take: 100,
    });
    for (const cart of carts) {
      const recentOrder = await db.order.findFirst({
        where: { customerEmailHash: cart.emailHash, createdAt: { gte: cart.updatedAt }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } },
      });
      if (recentOrder) {
        await db.abandonedCart.update({ where: { id: cart.id }, data: { recoveredAt: new Date() } });
        continue;
      }
      const customer = await db.customer.findUnique({ where: { emailHash: cart.emailHash } });
      // Solo se marca como enviado si el envío funcionó (si no, se reintenta en la siguiente ejecución)
      const sent = await sendEmail(
        abandonedCartEmail(
          { name: cart.name, email: cart.email, token: cart.token, unsubscribeToken: customer?.unsubscribeToken ?? `c-${cart.token}` },
          settings,
        ),
      );
      if (!sent) continue;
      await db.abandonedCart.update({ where: { id: cart.id }, data: { emailSentAt: new Date() } });
      report.cartEmails++;
    }
  }

  // 3. Recordatorios de celebraciones
  if (settings.marketing.remindersEnabled) {
    const today = localNow(settings.business.timezone).date;
    const target = addDays(today, settings.marketing.reminderDaysBefore);
    const [year, month, day] = target.split("-").map(Number);
    const reminders = await db.celebrationReminder.findMany({
      where: { active: true, month, day, OR: [{ lastSentYear: null }, { lastSentYear: { lt: year } }] },
      include: { customer: true },
      take: 500,
    });
    for (const r of reminders) {
      const sent = await sendEmail(
        reminderEmail(
          { name: r.customer.name, email: r.customer.email, label: r.label, date: formatLocalDate(target), unsubscribeToken: r.customer.unsubscribeToken },
          settings,
        ),
      );
      if (!sent) continue;
      await db.celebrationReminder.update({ where: { id: r.id }, data: { lastSentYear: year } });
      report.reminders++;
    }
  }

  // 4. Conservación limitada (RGPD): anonimización y borrado automáticos
  const retention = await applyRetention();

  // 5. Ancla externa del registro de auditoría: la huella actual sale del sistema (alerta diaria)
  const chain = await verifyAuditChain();
  if (!chain.ok) {
    await securityAlert("audit.chain_broken", "La cadena del registro de auditoría no es íntegra.", { brokenAtSeq: chain.brokenAtSeq ?? null }, { severity: "critical" });
  } else {
    await securityAlert("audit.anchor", "Huella diaria del registro de auditoría (guárdala para poder demostrar que no se ha alterado).", { entries: chain.checked, head: chain.head ?? null });
  }
  kickJobs();

  return NextResponse.json({ ok: true, ...report, retention, auditChainOk: chain.ok }, { headers: { "Cache-Control": "no-store" } });
}
