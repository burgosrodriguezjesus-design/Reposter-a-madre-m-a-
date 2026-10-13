import "server-only";
import { enqueue } from "@/lib/jobs";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

/**
 * Alertas de seguridad y operación. Se envían de forma asíncrona (cola con reintentos) al email
 * ALERT_EMAIL y/o al webhook ALERT_WEBHOOK_URL (Slack, Teams, Discord...).
 * NUNCA incluyen datos personales: solo tipo, mensaje genérico e identificadores internos.
 * Las alertas repetidas del mismo tipo se agrupan (una cada 10 minutos por clave).
 * - Tras encolarla se intenta enviar ya (after()), sin esperar al cron de la cola.
 * - Si la cola no está disponible (p. ej. la BD ha caído, que es justo cuando más importa), se
 *   envía directamente al webhook ALERT_WEBHOOK_URL, con la misma agrupación por proceso.
 */
export type AlertType =
  | "admin.login_locked"
  | "admin.bruteforce"
  | "admin.new_device"
  | "admin.mfa_failures"
  | "admin.recovery_code_used"
  | "admin.session_hijack_suspected"
  | "admin.permission_denied"
  | "admin.user_changed"
  | "admin.export"
  | "payment.failed"
  | "payment.amount_mismatch"
  | "payment.late"
  | "webhook.invalid_signature"
  | "jobs.failed"
  | "db.error"
  | "audit.chain_broken"
  | "audit.anchor"
  | "privacy.request";

export async function securityAlert(
  type: AlertType,
  message: string,
  meta: Record<string, string | number | boolean | null> = {},
  opts: { dedupe?: string; severity?: "warning" | "critical" } = {},
): Promise<void> {
  inc("security_alerts_total", { type }, 1, "Alertas de seguridad/operación emitidas");
  log.warn("alert", { type, message, ...meta });
  const bucket = Math.floor(Date.now() / 600_000);
  try {
    await enqueue(
      "alert.send",
      { type, message, severity: opts.severity ?? "warning", meta: JSON.stringify(meta).slice(0, 1000), at: new Date().toISOString() },
      { dedupeKey: `alert:${type}:${opts.dedupe ?? ""}:${bucket}`, maxAttempts: 10 },
    );
    // Envío inmediato tras responder (import diferido: job-handlers importa este módulo)
    const { kickJobs } = await import("@/lib/job-handlers");
    kickJobs();
  } catch (error) {
    log.error("alert.enqueue_failed", { type, error });
    await sendDirect(`alert:${type}:${opts.dedupe ?? ""}:${bucket}`, type, message, opts.severity ?? "warning", meta);
  }
}

const directSent = new Map<string, number>();

/** Envío directo al webhook, sin BD ni cola (último recurso). Nunca lanza. */
async function sendDirect(key: string, type: string, message: string, severity: string, meta: Record<string, unknown>) {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook || directSent.has(key)) return;
  directSent.set(key, Date.now());
  for (const [k, at] of directSent) if (Date.now() - at > 3600_000) directSent.delete(k);
  try {
    const text = `[${severity.toUpperCase()}] ${type} · ${message} · ${JSON.stringify(meta).slice(0, 500)} · ${new Date().toISOString()} · (envío directo: la cola de alertas no está disponible)`;
    const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
    inc("security_alerts_direct_total", { result: res.ok ? "ok" : "error" });
  } catch (error) {
    inc("security_alerts_direct_total", { result: "error" });
    log.error("alert.direct_failed", { type, error });
  }
}
