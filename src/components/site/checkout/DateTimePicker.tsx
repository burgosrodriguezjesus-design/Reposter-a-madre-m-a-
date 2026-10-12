"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import clsx from "clsx";
import type { DayAvailability } from "@/lib/availability";
import { formatLocalDate } from "@/lib/format";

const WEEK = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function DateTimePicker({
  leadHours,
  date,
  time,
  onChange,
  withTime = true,
  refreshKey = 0,
}: {
  leadHours: number;
  date: string;
  time: string;
  onChange: (value: { date: string; time: string }) => void;
  withTime?: boolean;
  refreshKey?: number;
}) {
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/availability?lead=${leadHours}&days=90`)
      .then((r) => r.json())
      .then((data: { days: DayAvailability[] }) => {
        if (!active) return;
        setDays(data.days);
        setError(null);
        const firstOpen = data.days.find((d) => d.status === "open");
        setMonth((m) => m ?? (firstOpen ?? data.days[0])?.date.slice(0, 7) ?? null);
      })
      .catch(() => active && setError("No se pudo cargar el calendario. Recarga la página."));
    return () => {
      active = false;
    };
  }, [leadHours, refreshKey]);

  const byDate = useMemo(() => new Map((days ?? []).map((d) => [d.date, d])), [days]);
  const months = useMemo(() => [...new Set((days ?? []).map((d) => d.date.slice(0, 7)))], [days]);
  const selectedDay = date ? byDate.get(date) : undefined;

  // Si la fecha elegida deja de estar disponible (p. ej. al cambiar el carrito), se limpia.
  useEffect(() => {
    if (!days || !date) return;
    const day = byDate.get(date);
    const slotOk = !withTime || day?.slots.some((s) => s.time === time && s.available);
    if (!day || day.status !== "open" || (time && !slotOk)) onChange({ date: day?.status === "open" ? date : "", time: "" });
  }, [days, byDate, date, time, withTime, onChange]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!days || !month) {
    return (
      <p className="flex items-center gap-2 text-sm text-cocoa-500">
        <LoaderCircle className="size-4 animate-spin" /> Cargando disponibilidad…
      </p>
    );
  }

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthIndex = months.indexOf(month);
  const morning = selectedDay?.slots.filter((s) => s.time < "14:30") ?? [];
  const afternoon = selectedDay?.slots.filter((s) => s.time >= "14:30") ?? [];

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,340px)_1fr]">
      <div className="rounded-3xl border border-sand-300/70 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-cream-200 disabled:opacity-30"
            onClick={() => setMonth(months[monthIndex - 1])}
            disabled={monthIndex <= 0}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="font-display text-lg capitalize text-cocoa-900">
            {MONTHS[m - 1]} {y}
          </p>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-cream-200 disabled:opacity-30"
            onClick={() => setMonth(months[monthIndex + 1])}
            disabled={monthIndex >= months.length - 1}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-cocoa-500">
          {WEEK.map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendario de disponibilidad">
          {cells.map((cell, i) => {
            if (!cell) return <span key={`e${i}`} />;
            const day = byDate.get(cell);
            const open = day?.status === "open";
            const selected = cell === date;
            return (
              <button
                type="button"
                key={cell}
                disabled={!open}
                title={day && !open ? day.reason : undefined}
                onClick={() => onChange({ date: cell, time: "" })}
                aria-pressed={selected}
                aria-label={`${formatLocalDate(cell)}${open ? "" : `: ${day?.reason ?? "no disponible"}`}`}
                className={clsx(
                  "aspect-square rounded-xl text-sm font-medium transition",
                  selected
                    ? "bg-blush-600 text-white shadow-soft"
                    : open
                      ? "bg-blush-50 text-cocoa-900 hover:bg-blush-200"
                      : "cursor-not-allowed text-cocoa-300 line-through decoration-cocoa-200",
                )}
              >
                {Number(cell.slice(8))}
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-3 text-xs text-cocoa-500">
          <span className="inline-block size-3 rounded bg-blush-50 ring-1 ring-blush-200" /> Disponible
          <span className="inline-block size-3 rounded bg-blush-600" /> Elegido
        </p>
      </div>

      {withTime && (
        <div>
          {!selectedDay ? (
            <p className="rounded-3xl border border-dashed border-sand-400 p-6 text-sm text-cocoa-500">
              Elige un día en el calendario para ver las horas disponibles.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold text-cocoa-900 first-letter:uppercase">{formatLocalDate(selectedDay.date)}</p>
              {[
                { label: "Mañana", slots: morning },
                { label: "Tarde", slots: afternoon },
              ]
                .filter((g) => g.slots.length)
                .map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-semibold tracking-wider text-cocoa-500 uppercase">{group.label}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {group.slots.map((slot) => (
                        <button
                          type="button"
                          key={slot.time}
                          disabled={!slot.available}
                          onClick={() => onChange({ date: selectedDay.date, time: slot.time })}
                          aria-pressed={slot.time === time}
                          className={clsx(
                            "rounded-xl border py-2.5 text-sm font-semibold transition",
                            slot.time === time
                              ? "border-blush-600 bg-blush-600 text-white"
                              : slot.available
                                ? "border-sand-300 bg-white text-cocoa-800 hover:border-blush-400"
                                : "cursor-not-allowed border-transparent bg-cream-200 text-cocoa-300 line-through",
                          )}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
