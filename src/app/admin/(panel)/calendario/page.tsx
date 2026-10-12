import Link from "next/link";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { SettingsForm, type FieldDef } from "@/components/admin/SettingsForm";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { availabilityContext } from "@/lib/schedule";
import { getCalendar } from "@/lib/availability";
import { formatLocalDate } from "@/lib/format";
import { HoursEditor } from "./HoursEditor";
import { addBlockedDate, removeBlockedDate } from "./actions";

export const metadata = { title: "Calendario y horario" };

const CAPACITY_FIELDS: FieldDef[] = [
  { name: "minLeadHours", label: "Antelación mínima general (horas)", type: "number", hint: "Cada producto puede pedir más antelación." },
  { name: "maxAdvanceDays", label: "Reservas como máximo con (días)", type: "number" },
  { name: "slotMinutes", label: "Duración de cada franja (minutos)", type: "number", hint: "Cada cuánto se puede elegir hora de recogida." },
  { name: "maxOrdersPerSlot", label: "Pedidos máximos por franja", type: "number", hint: "0 = sin límite" },
  { name: "maxOrdersPerDay", label: "Pedidos máximos por día", type: "number", hint: "0 = sin límite" },
];

export default async function CalendarPage() {
  const [settings, hours, blocked, ctx] = await Promise.all([
    getSettings(),
    db.openingHour.findMany({ orderBy: [{ weekday: "asc" }, { opensAt: "asc" }] }),
    db.blockedDate.findMany({ orderBy: { startDate: "asc" } }),
    availabilityContext(0),
  ]);
  const days = getCalendar({ ...ctx, leadHours: 0 }, 20);
  const o = settings.ordering;

  return (
    <>
      <PageHeader title="Calendario y horario" description="Controla cuándo y cuántos pedidos aceptas. La web solo ofrece los huecos libres." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card title="Próximos días">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {days.map((d) => {
                const count = ctx.counts.perDay[d.date] ?? 0;
                return (
                  <li
                    key={d.date}
                    className={clsx(
                      "rounded-xl border p-3 text-sm",
                      d.status === "open" ? "border-sand-300/70 bg-white" : d.status === "full" ? "border-amber-300 bg-amber-50" : "border-transparent bg-cream-200 text-cocoa-500",
                    )}
                  >
                    <p className="font-semibold capitalize text-cocoa-900">{formatLocalDate(d.date, "short")}</p>
                    <p className="text-xs">{new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" }).format(new Date(`${d.date}T12:00:00Z`))}</p>
                    <p className="mt-1">
                      {d.status === "closed" || d.status === "blocked" ? (
                        d.reason
                      ) : (
                        <Link href={`/admin/pedidos?vista=todos&fecha=${d.date}`} className="font-medium">
                          {count} pedido{count === 1 ? "" : "s"}
                          {o.maxOrdersPerDay ? ` / ${o.maxOrdersPerDay}` : ""}
                        </Link>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Horario de apertura y recogida">
            <HoursEditor initial={hours.map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt }))} />
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Vacaciones y días bloqueados">
            <ul className="mb-4 space-y-2">
              {blocked.length === 0 && <li className="text-sm text-cocoa-500">No hay días bloqueados.</li>}
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-cream-50 px-3 py-2 text-sm">
                  <span>
                    <strong>{formatLocalDate(b.startDate, "short")}</strong>
                    {b.endDate !== b.startDate && <> → <strong>{formatLocalDate(b.endDate, "short")}</strong></>}
                    <span className="block text-cocoa-500">{b.reason}</span>
                  </span>
                  <form action={removeBlockedDate}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="btn-ghost size-9 p-0" aria-label="Desbloquear">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <ActionForm action={addBlockedDate} className="space-y-3" resetOnSuccess>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Desde">
                  <input type="date" name="startDate" required className="input" />
                </Field>
                <Field label="Hasta">
                  <input type="date" name="endDate" className="input" />
                </Field>
              </div>
              <Field label="Motivo">
                <input name="reason" className="input" placeholder="Vacaciones, festivo, completo…" />
              </Field>
              <SubmitButton className="btn-dark btn-sm">Bloquear días</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Capacidad y antelación">
            <SettingsForm section="ordering" fields={CAPACITY_FIELDS} initial={Object.fromEntries(CAPACITY_FIELDS.map((f) => [f.name, o[f.name as keyof typeof o]]))} />
          </Card>
        </div>
      </div>
    </>
  );
}
