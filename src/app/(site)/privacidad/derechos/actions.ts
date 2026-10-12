"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailHash, sha256 } from "@/lib/crypto";
import { secureToken } from "@/lib/ids";
import { limitByIp } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { getSettings } from "@/lib/settings";
import { escapeHtml } from "@/lib/emails";
import { emailSchema } from "@/lib/validation";
import { securityAlert } from "@/lib/alerts";
import { audit } from "@/lib/audit";

const TYPES = ["ACCESS", "RECTIFICATION", "ERASURE", "PORTABILITY", "OBJECTION", "RESTRICTION"] as const;
const LABEL: Record<(typeof TYPES)[number], string> = {
  ACCESS: "acceso",
  RECTIFICATION: "rectificación",
  ERASURE: "supresión",
  PORTABILITY: "portabilidad",
  OBJECTION: "oposición",
  RESTRICTION: "limitación del tratamiento",
};

const schema = z.object({
  type: z.enum(TYPES),
  email: emailSchema,
  details: z.string().trim().max(2000).optional(),
  website: z.string().max(0).optional(),
});

/** Solicitud de derechos: se confirma con un enlace enviado al propio email (verifica la identidad). */
export async function requestRights(formData: FormData) {
  if (!(await limitByIp("privacy", 5, 60 * 60_000))) redirect("/privacidad/derechos?error=limite");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/privacidad/derechos?error=datos");
  const { type, email, details } = parsed.data;
  const token = secureToken(32);
  await db.dataRequest.create({
    data: {
      type,
      email,
      emailHash: emailHash(email),
      details: details || null,
      verifyTokenHash: sha256(token),
      dueAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  const settings = await getSettings();
  const link = siteUrl(`/privacidad/derechos/verificar?t=${token}`);
  await sendEmail({
    to: email,
    subject: `Confirma tu solicitud de ${LABEL[type]} de datos · ${settings.business.name}`,
    html: `<p>Hemos recibido una solicitud de <strong>${LABEL[type]}</strong> de tus datos personales.</p><p>Para confirmar que eres tú, abre este enlace (caduca en 7 días):</p><p><a href="${link}">Confirmar mi solicitud</a></p><p style="font-size:12px;color:#7A6458">Si no la has hecho tú, ignora este mensaje: no haremos nada.</p><p>${escapeHtml(settings.business.name)}</p>`,
    text: `Confirma tu solicitud de ${LABEL[type]} de datos: ${link} (caduca en 7 días). Si no la has hecho tú, ignora este mensaje.`,
  });
  // Misma respuesta exista o no el email en nuestros registros
  redirect("/privacidad/derechos?enviado=1");
}

export async function confirmRights(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) redirect("/privacidad/derechos/verificar?error=1");
  const request = await db.dataRequest.findUnique({ where: { verifyTokenHash: sha256(token) } });
  if (!request || request.status !== "UNVERIFIED" || request.createdAt < new Date(Date.now() - 7 * 86_400_000)) {
    redirect("/privacidad/derechos/verificar?error=1");
  }
  await db.dataRequest.update({ where: { id: request.id }, data: { status: "VERIFIED", verifiedAt: new Date(), verifyTokenHash: null } });
  await audit({ action: "privacy.request_verified", entity: "DataRequest", entityId: request.id, details: { type: request.type } });
  await securityAlert("privacy.request", "Nueva solicitud de derechos RGPD verificada: plazo legal de respuesta, 1 mes.", { requestId: request.id, type: request.type });
  redirect("/privacidad/derechos/verificar?ok=1");
}
