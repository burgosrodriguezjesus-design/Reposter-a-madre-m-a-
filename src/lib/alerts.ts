import "server-only";
import { enqueue } from "@/lib/jobs";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

/**
 * Alertas de seguridad y operación. Se envían de forma asíncrona (cola con reintentos) al email
 * ALERT_EMAIL y/o al webhook ALERT_WEBHOOK_URL (Slack, Teams, Discord...).
 * NUNCA incluyen datos personales: solo tipo, mensaje genérico e identificadores internos.
 * Las alertas repetidas del mismo tipo se agrupan (una cada 10 minutos por clave).
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
  | "order.failed"
  | "webhook.invalid_signature"
  | "jobs.failed"
  | "db.error"
  | "service.down"
  | "traffic.anomaly"
  | "upload.rejected"
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
  } catch (error) {
    // Si la base de datos no está disponible, al menos queda en el registro
    log.error("alert.enqueue_failed", { type, error });
  }
}
