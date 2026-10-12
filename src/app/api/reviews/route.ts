import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailHash, safeEqual } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { reviewSchema, firstError } from "@/lib/validation";
import { limitByIp } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { escapeHtml } from "@/lib/emails";

/** Opinión de un cliente. Queda pendiente hasta que el administrador la aprueba. */
export async function POST(request: Request) {
  if (!(await limitByIp("reviews", 3, 60 * 60_000))) return NextResponse.json({ error: "Ya hemos recibido tu opinión, ¡gracias!" }, { status: 429 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  const input = parsed.data;
  if (input.website) return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });

  // Verificada si el número de pedido y el email corresponden a un pedido entregado
  let verified = false;
  const number = input.orderNumber?.trim().toUpperCase();
  if (number && input.email) {
    const order = await db.order.findUnique({ where: { number }, select: { customerEmailHash: true, status: true } });
    verified = !!order && safeEqual(order.customerEmailHash, emailHash(input.email)) && order.status === "DELIVERED";
  }

  await db.review.create({
    data: {
      authorName: input.authorName,
      rating: input.rating,
      text: input.text,
      orderNumber: number || null,
      verified,
      status: "PENDING",
    },
  });

  const settings = await getSettings();
  const admin = settings.notifications.adminEmail || settings.business.email;
  if (admin) {
    await sendEmail({
      to: admin,
      subject: `Nueva opinión (${input.rating}★) pendiente de revisar`,
      html: `<p><strong>${escapeHtml(input.authorName)}</strong> (${input.rating}★)${verified ? " · pedido verificado" : ""}</p><p>${escapeHtml(input.text)}</p><p><a href="${siteUrl("/admin/opiniones")}">Revisar en el panel</a></p>`,
      text: `${input.authorName} (${input.rating}★): ${input.text}\n${siteUrl("/admin/opiniones")}`,
    });
  }
  return NextResponse.json({ ok: true });
}
