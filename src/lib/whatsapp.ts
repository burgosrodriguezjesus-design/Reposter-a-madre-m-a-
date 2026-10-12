import "server-only";
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
    if (!res.ok) console.error("[whatsapp]", res.status, await res.text());
    return res.ok;
  } catch (error) {
    console.error("[whatsapp] Error de envío", error);
    return false;
  }
}
