import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
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
 * Envía un correo. Nunca lanza excepciones: un fallo de correo no debe impedir
 * que se registre un pedido. Sin SMTP configurado, el correo se muestra en consola.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!message.to) return false;
  const t = getTransporter();
  if (!t) {
    console.info(`\n[email:simulado] Para: ${message.to}\nAsunto: ${message.subject}\n${message.text}\n`);
    return false;
  }
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      headers: message.headers,
    });
    return true;
  } catch (error) {
    console.error("[email] Error al enviar a", message.to, error);
    return false;
  }
}
