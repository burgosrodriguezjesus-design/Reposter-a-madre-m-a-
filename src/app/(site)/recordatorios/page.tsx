import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { secureToken } from "@/lib/ids";
import { limitByIp } from "@/lib/rate-limit";
import { emailSchema } from "@/lib/validation";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { escapeHtml } from "@/lib/emails";

export const metadata: Metadata = {
  title: "Recordatorios de celebraciones",
  description: "Te avisamos por email antes de cumpleaños y aniversarios importantes para que encargues la tarta a tiempo.",
  alternates: { canonical: "/recordatorios" },
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  label: z.string().trim().min(3).max(80),
  day: z.coerce.number().int().min(1).max(31),
  month: z.coerce.number().int().min(1).max(12),
  consent: z.literal("on"),
});

async function subscribe(formData: FormData) {
  "use server";
  if (!(await limitByIp("reminders", 6, 60 * 60_000))) redirect("/recordatorios?error=limite");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/recordatorios?error=datos");
  const { name, email, label, day, month } = parsed.data;
  const customer = await db.customer.upsert({
    where: { email },
    create: { email, name, unsubscribeToken: secureToken() },
    update: {},
  });
  const count = await db.celebrationReminder.count({ where: { customerId: customer.id, active: true } });
  if (count >= 10) redirect("/recordatorios?error=max");
  await db.celebrationReminder.create({ data: { customerId: customer.id, label, day, month, consentAt: new Date() } });

  const settings = await getSettings();
  const unsub = siteUrl(`/baja?t=${customer.unsubscribeToken}`);
  await sendEmail({
    to: email,
    subject: "Recordatorio guardado 🎂",
    html: `<p>Hola ${escapeHtml(name)},</p><p>Te avisaremos unos días antes de <strong>${escapeHtml(label)}</strong> (${day} de ${MONTHS[month - 1]}) para que puedas encargar la tarta a tiempo.</p><p style="font-size:12px;color:#7A6458">Si no has sido tú o ya no lo quieres, <a href="${unsub}">date de baja aquí</a>.</p><p>${escapeHtml(settings.business.name)}</p>`,
    text: `Te avisaremos antes de ${label} (${day}/${month}). Baja: ${unsub}`,
  });
  redirect("/recordatorios?ok=1");
}

export default async function RemindersPage({ searchParams }: PageProps<"/recordatorios">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  if (!settings.marketing.remindersEnabled) redirect("/");
  const errors: Record<string, string> = {
    limite: "Demasiados intentos, prueba más tarde.",
    datos: "Revisa los datos y marca la casilla de consentimiento.",
    max: "Has alcanzado el máximo de recordatorios.",
  };
  return (
    <div className="container-page max-w-2xl py-14">
      <BellRing className="size-12 text-blush-500" strokeWidth={1.5} />
      <h1 className="mt-4 font-display text-4xl text-cocoa-900">Que no se te pase ninguna celebración</h1>
      <p className="mt-3 text-cocoa-600">
        Dinos qué fecha quieres recordar y te enviaremos un único email {settings.marketing.reminderDaysBefore} días antes cada año. Puedes darte de baja
        en cualquier momento.
      </p>
      {params.ok === "1" ? (
        <div className="card mt-8 p-8 text-center">
          <p className="font-display text-2xl text-cocoa-900">¡Recordatorio guardado!</p>
          <p className="mt-2 text-cocoa-600">Te hemos enviado un email de confirmación.</p>
          <Link href="/recordatorios" className="btn-outline mt-6">
            Añadir otra fecha
          </Link>
        </div>
      ) : (
        <form action={subscribe} className="card mt-8 grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="r-name">
              Tu nombre
            </label>
            <input id="r-name" name="name" required className="input" autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="r-email">
              Email
            </label>
            <input id="r-email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="r-label">
              ¿Qué celebramos?
            </label>
            <input id="r-label" name="label" required className="input" placeholder="Cumpleaños de mamá, nuestro aniversario…" />
          </div>
          <div>
            <label className="label" htmlFor="r-day">
              Día
            </label>
            <select id="r-day" name="day" className="input" required>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="r-month">
              Mes
            </label>
            <select id="r-month" name="month" className="input" required>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-3 text-sm text-cocoa-700 sm:col-span-2">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-blush-600" />
            <span>
              Quiero recibir este recordatorio por email y acepto la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium text-blush-700 underline">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          {typeof params.error === "string" && errors[params.error] && (
            <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{errors[params.error]}</p>
          )}
          <button type="submit" className="btn-primary sm:col-span-2">
            Guardar recordatorio
          </button>
        </form>
      )}
    </div>
  );
}
