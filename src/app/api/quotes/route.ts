import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { emailHash } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { priceCustomCake } from "@/lib/pricing";
import { quoteRequestSchema, firstError } from "@/lib/validation";
import { limitByIp } from "@/lib/rate-limit";
import { isOwnUploadUrl } from "@/lib/storage";
import { quoteNumber, secureToken } from "@/lib/ids";
import { availabilityContext } from "@/lib/schedule";
import { getDayAvailability } from "@/lib/availability";
import { quoteUrl } from "@/lib/emails";
import { enqueue } from "@/lib/jobs";
import { kickJobs } from "@/lib/job-handlers";

/** Solicitud de presupuesto para tartas con diseños complejos. */
export async function POST(request: Request) {
  if (!(await limitByIp("quotes", 5, 30 * 60_000))) {
    return NextResponse.json({ error: "Has enviado varias solicitudes seguidas. Espera un poco o escríbenos." }, { status: 429 });
  }
  const parsed = quoteRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  const input = parsed.data;
  if (input.website) return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });

  const settings = await getSettings();
  if (input.fulfillment === "DELIVERY" && !settings.ordering.deliveryEnabled) {
    return NextResponse.json({ error: "Solo hacemos recogida en tienda" }, { status: 400 });
  }
  const priced = priceCustomCake(settings.builder, input.spec);
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: 400 });
  if (input.referencePhotoUrl && !isOwnUploadUrl(input.referencePhotoUrl)) {
    return NextResponse.json({ error: "La foto de referencia no es válida" }, { status: 400 });
  }

  const ctx = await availabilityContext(settings.builder.leadTimeHours);
  const day = getDayAvailability(input.desiredDate, ctx);
  if (day.status !== "open") {
    return NextResponse.json({ error: `La fecha elegida no está disponible (${day.reason ?? "elige otra"})` }, { status: 409 });
  }

  const quote = await db.quoteRequest.create({
    data: {
      number: quoteNumber(),
      accessToken: secureToken(),
      spec: { spec: input.spec, summary: priced.summary, requiresQuote: priced.requiresQuote } as unknown as Prisma.InputJsonValue,
      estimatedCents: priced.priceCents,
      customerName: input.customer.name,
      customerEmail: input.customer.email,
      customerEmailHash: emailHash(input.customer.email),
      customerPhone: input.customer.phone,
      desiredDate: input.desiredDate,
      fulfillment: input.fulfillment,
      notes: input.notes || null,
      referencePhotoUrl: input.referencePhotoUrl || null,
    },
  });

  await enqueue("email.send", { template: "quote-received", quoteId: quote.id }, { dedupeKey: `email:quote-received:${quote.id}` });
  await enqueue("email.send", { template: "quote-admin", quoteId: quote.id }, { dedupeKey: `email:quote-admin:${quote.id}` });
  kickJobs();

  return NextResponse.json({ ok: true, url: quoteUrl(quote).replace(/^https?:\/\/[^/]+/, "") });
}
