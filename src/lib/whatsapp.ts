import "server-only";
import { log } from "@/lib/logger";
import { phoneToWhatsApp } from "@/lib/format";

/**
 * Integración opcional con la API oficial de WhatsApp Business (Cloud API de Meta).
 * Solo se envían plantillas aprobadas por Meta y únicamente a destinatarios que lo han
 * autorizado (el propio negocio). Para clientes se usan enlaces wa.me iniciados por ellos.
 */
export function isWhatsAppApiConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppTemplate(to: string, template: string, params: string[]): Promise<boolean> {
  if (!isWhatsAppApiConfigured() || !template || !to) return false;
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phoneToWhatsApp(to),
          type: "template",
          template: {
            name: template,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "es" },
            components: [
              { type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 1000) })) },
            ],
          },
        }),
      },
    );
    // La respuesta de Meta puede repetir el teléfono: solo se registra el estado y el código de error
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: number } } | null;
      log.warn("whatsapp.error", { status: res.status, code: body?.error?.code ?? null });
    }
    return res.ok;
  } catch (error) {
    log.warn("whatsapp.send_failed", { error });
    return false;
  }
}
