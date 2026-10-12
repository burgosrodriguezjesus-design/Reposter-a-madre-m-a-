import "server-only";
import { after } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { deliverEmail, type EmailMessage } from "@/lib/email";
import {
  escapeHtml,
  giftCardEmails,
  loyaltyRewardEmail,
  newOrderAdminEmail,
  newQuoteAdminEmail,
  orderReceivedEmail,
  orderStatusEmail,
  quoteAnsweredEmail,
  quoteReceivedEmail,
} from "@/lib/emails";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { formatLocalDate, formatPrice } from "@/lib/format";
import { awardLoyalty, handleOrderConfirmed } from "@/lib/order-events";
import { processJobs, type JobHandler, type JobPayload } from "@/lib/jobs";
import { securityAlert } from "@/lib/alerts";
import { log } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";

/** Plantillas de email que se envían desde la cola (el payload solo lleva identificadores). */
async function buildEmails(p: JobPayload): Promise<EmailMessage[]> {
  const settings = await getSettings();
  const admin = settings.notifications.adminEmail || settings.business.email;
  switch (p.template) {
    case "order-received":
    case "order-admin":
    case "order-status": {
      const order = await db.order.findUnique({ where: { id: String(p.orderId) }, include: { items: true } });
      if (!order || order.anonymizedAt) return [];
      if (p.template === "order-received") return [orderReceivedEmail(order, settings)];
      if (p.template === "order-admin") return admin ? [newOrderAdminEmail(order, settings, admin)] : [];
      return [orderStatusEmail(order, settings, String(p.status) as OrderStatus, typeof p.note === "string" ? p.note : null)];
    }
    case "quote-received":
    case "quote-admin":
    case "quote-answered": {
      const quote = await db.quoteRequest.findUnique({ where: { id: String(p.quoteId) } });
      if (!quote) return [];
      if (p.template === "quote-received") return [quoteReceivedEmail(quote, settings)];
      if (p.template === "quote-admin") return admin ? [newQuoteAdminEmail(quote, settings, admin)] : [];
      return [quoteAnsweredEmail(quote, settings)];
    }
    case "giftcard": {
      const card = await db.giftCard.findUnique({ where: { id: String(p.giftCardId) } });
      return card ? giftCardEmails(card, settings) : [];
    }
    case "loyalty": {
      const customer = await db.customer.findUnique({ where: { id: String(p.customerId) } });
      if (!customer) return [];
      return [loyaltyRewardEmail({ name: customer.name, email: customer.email, code: String(p.code), amountCents: Number(p.amountCents) }, settings)];
    }
    default:
      throw new Error(`Plantilla desconocida: ${String(p.template)}`);
  }
}

const handlers: Record<string, JobHandler> = {
  "order.confirmed": async (p) => handleOrderConfirmed(String(p.orderId)),
  "order.loyalty": async (p) => {
    await awardLoyalty(String(p.orderId));
  },
  "email.send": async (p) => {
    for (const message of await buildEmails(p)) await deliverEmail(message);
  },
  "whatsapp.new-order": async (p) => {
    const settings = await getSettings();
    const order = await db.order.findUnique({ where: { id: String(p.orderId) } });
    if (!order || !settings.notifications.adminWhatsapp) return;
    const ok = await sendWhatsAppTemplate(settings.notifications.adminWhatsapp, process.env.WHATSAPP_TEMPLATE_NEW_ORDER ?? "", [
      `${order.number} · ${order.customerName} · ${formatLocalDate(order.scheduledDate, "short")} ${order.scheduledTime} · ${formatPrice(order.totalCents)}`,
    ]);
    if (!ok && process.env.WHATSAPP_TOKEN) throw new Error("WhatsApp no aceptó el mensaje");
  },
  "email.admin-new-device": async (p) => {
    const user = await db.adminUser.findUnique({ where: { id: String(p.userId) }, select: { email: true, name: true } });
    if (!user) return;
    const settings = await getSettings();
    await deliverEmail({
      to: user.email,
      subject: `Nuevo acceso a tu cuenta del panel · ${settings.business.name}`,
      html: `<p>Hola ${escapeHtml(user.name)},</p><p>Se ha entrado en tu cuenta del panel desde <strong>${escapeHtml(String(p.device))}</strong> el ${escapeHtml(new Date(String(p.at)).toLocaleString("es-ES", { timeZone: settings.business.timezone }))}.</p><p>Si no has sido tú, entra en <a href="${siteUrl("/admin/seguridad")}">Mi cuenta y seguridad</a>, cambia tu contraseña y cierra las demás sesiones, y avisa al propietario.</p>`,
      text: `Nuevo acceso a tu cuenta del panel desde ${String(p.device)}. Si no has sido tú, cambia la contraseña en ${siteUrl("/admin/seguridad")}.`,
    });
  },
  "alert.send": async (p) => {
    // Sin datos personales: tipo, mensaje genérico e identificadores internos
    const settings = await getSettings();
    const text = `[${String(p.severity).toUpperCase()}] ${String(p.type)} · ${String(p.message)} · ${String(p.meta)} · ${String(p.at)}`;
    const to = process.env.ALERT_EMAIL || settings.notifications.adminEmail || settings.business.email;
    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (webhook) {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${settings.business.name}: ${text}` }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Webhook de alertas respondió ${res.status}`);
    }
    if (to) {
      await deliverEmail({
        to,
        subject: `⚠️ Alerta de seguridad/operación: ${String(p.type)}`,
        html: `<p>${escapeHtml(text)}</p><p>Revisa el <a href="${siteUrl("/admin/auditoria?nivel=alertas")}">registro de actividad</a>.</p>`,
        text,
      });
    }
  },
};

/** Procesa trabajos pendientes (cron cada minuto y, de forma oportunista, tras cada pedido). */
export async function runJobs(opts: { limit?: number; timeBudgetMs?: number } = {}) {
  return processJobs(handlers, {
    ...opts,
    onPermanentFailure: async (job, error) => {
      if (job.type === "alert.send") return; // evita bucles de alertas
      await securityAlert("jobs.failed", `Un trabajo en segundo plano ha fallado definitivamente (${job.type}). Reintenta desde el panel.`, { jobId: job.id, error: error.slice(0, 120) }, { dedupe: job.type });
    },
  });
}

/** Tras responder al cliente, intenta enviar ya los avisos (si falla, el cron los reintenta). */
export function kickJobs() {
  try {
    after(async () => {
      try {
        await runJobs({ limit: 10, timeBudgetMs: 8000 });
      } catch (error) {
        log.warn("jobs.kick_failed", { error });
      }
    });
  } catch {
    // Fuera de una petición (scripts): no hace nada
  }
}
