import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { log, maskString } from "@/lib/logger";

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    // Cifrado obligatorio hacia el servidor de correo (STARTTLS en 587), TLS 1.2 como mínimo
    requireTLS: port !== 465 && process.env.SMTP_ALLOW_PLAINTEXT !== "true",
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
    pool: true,
    maxConnections: 3,
  });
  return transporter;
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

/**
 * Envía un correo y LANZA un error si falla (lo usa la cola de trabajos para reintentar).
 * Sin SMTP configurado: en desarrollo se muestra en consola; en producción se registra sin datos personales.
 */
export async function deliverEmail(message: EmailMessage): Promise<void> {
  if (!message.to) return;
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[email:simulado] Para: ${message.to}\nAsunto: ${message.subject}\n${message.text}\n`);
    } else {
      log.warn("email.not_configured", { subject: maskString(message.subject) });
    }
    return;
  }
  await t.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
    headers: message.headers,
  });
}

/** Envío directo que nunca lanza (solo para avisos no críticos). Lo importante va por la cola. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  try {
    await deliverEmail(message);
    return true;
  } catch (error) {
    log.error("email.failed", { error });
    return false;
  }
}
