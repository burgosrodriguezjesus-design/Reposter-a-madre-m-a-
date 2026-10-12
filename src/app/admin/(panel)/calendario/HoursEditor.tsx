"use client";

import { useState, useTransition } from "react";
import { Copy, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { ResultMessage, type ActionResult } from "@/components/admin/forms";
import { saveOpeningHours } from "./actions";

const DAYS = [
  { n: 1, name: "Lunes" },
  { n: 2, name: "Martes" },
  { n: 3, name: "Miércoles" },
  { n: 4, name: "Jueves" },
  { n: 5, name: "Viernes" },
  { n: 6, name: "Sábado" },
  { n: 0, name: "Domingo" },
];

type Row = { weekday: number; opensAt: string; closesAt: string };

export function HoursEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();

  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const copyToAll = (weekday: number) => {
    const source = rows.filter((r) => r.weekday === weekday);
    const openDays = DAYS.filter((d) => rows.some((r) => r.weekday === d.n)).map((d) => d.n);
    setRows([...rows.filter((r) => !openDays.includes(r.weekday) || r.weekday === weekday), ...openDays.filter((d) => d !== weekday).flatMap((d) => source.map((s) => ({ ...s, weekday: d })))]);
  };

  return (
    <div className="space-y-3">
      {DAYS.map((day) => {
        const dayRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === day.n);
        return (
          <div key={day.n} className="flex flex-col gap-2 rounded-xl border border-sand-300/70 p-3 sm:flex-row sm:items-start">
            <div className="flex w-32 items-center justify-between sm:block">
              <p className="font-semibold text-cocoa-900">{day.name}</p>
              {dayRows.length === 0 && <p className="text-sm text-cocoa-400">Cerrado</p>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {dayRows.map(({ r, i }) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" value={r.opensAt} onChange={(e) => update(i, { opensAt: e.target.value })} className="input min-w-0 flex-1 py-2 sm:w-32 sm:flex-none" aria-label="Abre" />
                  <span className="text-cocoa-500">a</span>
                  <input type="time" value={r.closesAt} onChange={(e) => update(i, { closesAt: e.target.value })} className="input min-w-0 flex-1 py-2 sm:w-32 sm:flex-none" aria-label="Cierra" />
                  <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="btn-ghost size-10 p-0" aria-label="Quitar franja">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setRows([...rows, { weekday: day.n, opensAt: dayRows.length ? "17:00" : "09:30", closesAt: dayRows.length ? "20:30" : "14:00" }])}>
                  <Plus className="size-4" /> {dayRows.length ? "Añadir franja" : "Abrir este día"}
                </button>
                {dayRows.length > 0 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => copyToAll(day.n)} title="Copiar este horario al resto de días abiertos">
                    <Copy className="size-4" /> Copiar a días abiertos
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => setResult(await saveOpeningHours(rows)))}>
          {pending && <LoaderCircle className="size-4 animate-spin" />} Guardar horario
        </button>
        <ResultMessage result={result} />
      </div>
    </div>
  );
}
