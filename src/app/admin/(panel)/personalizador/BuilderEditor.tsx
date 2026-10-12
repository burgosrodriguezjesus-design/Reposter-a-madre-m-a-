"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { ResultMessage, type ActionResult } from "@/components/admin/forms";
import type { BuilderOption, BuilderSettings, BuilderSize } from "@/lib/settings-types";
import { slugify } from "@/lib/format";
import { saveSettingsSection } from "../ajustes/actions";

const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const cents = (v: string) => Math.round(Number.parseFloat(v.replace(",", ".")) * 100) || 0;

function Money({ value, onChange }: { value: number; onChange: (c: number) => void }) {
  const [text, setText] = useState(euros(value));
  return (
    <div className="relative">
      <input
        className="input py-2 pr-7"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(cents(e.target.value));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-cocoa-500">€</span>
    </div>
  );
}

function OptionList({
  title,
  hint,
  items,
  onChange,
  withQuote = false,
  withColor = false,
}: {
  title: string;
  hint?: string;
  items: BuilderOption[];
  onChange: (items: BuilderOption[]) => void;
  withQuote?: boolean;
  withColor?: boolean;
}) {
  const update = (i: number, patch: Partial<BuilderOption>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <section className="rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft">
      <h2 className="font-semibold text-cocoa-900">{title}</h2>
      {hint && <p className="text-xs text-cocoa-500">{hint}</p>}
      <div className="mt-3 space-y-2">
        {items.map((it, i) => (
          <div key={it.id || i} className="flex flex-wrap items-center gap-2">
            {withColor && (
              <input type="color" value={it.hex ?? "#F6D9DE"} onChange={(e) => update(i, { hex: e.target.value.toUpperCase() })} className="h-10 w-12 rounded-lg border border-sand-300" aria-label="Color" />
            )}
            <input className="input min-w-40 flex-1 py-2" value={it.label} onChange={(e) => update(i, { label: e.target.value, id: it.id || slugify(e.target.value) })} placeholder="Nombre" />
            <div className="w-28">
              <Money value={it.priceDeltaCents} onChange={(c) => update(i, { priceDeltaCents: c })} />
            </div>
            {withQuote && (
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={!!it.requiresQuote} onChange={(e) => update(i, { requiresQuote: e.target.checked })} className="size-4 accent-blush-600" /> Presupuesto
              </label>
            )}
            <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="btn-ghost size-10 p-0" aria-label="Quitar">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, { id: `op-${Date.now().toString(36)}`, label: "", priceDeltaCents: 0, ...(withColor ? { hex: "#F6D9DE" } : {}) }])}>
          <Plus className="size-4" /> Añadir
        </button>
      </div>
    </section>
  );
}

export function BuilderEditor({ initial }: { initial: BuilderSettings }) {
  const [b, setB] = useState(initial);
  const [celebrations, setCelebrations] = useState(initial.celebrations.join(", "));
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof BuilderSettings>(k: K, v: BuilderSettings[K]) => setB((prev) => ({ ...prev, [k]: v }));
  const updateSize = (i: number, patch: Partial<BuilderSize>) => set("sizes", b.sizes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  function save() {
    start(async () => {
      const values = {
        ...b,
        celebrations: celebrations.split(",").map((c) => c.trim()).filter(Boolean),
        sponges: b.sponges.filter((o) => o.label.trim()),
        fillings: b.fillings.filter((o) => o.label.trim()),
        coverings: b.coverings.filter((o) => o.label.trim()),
        colors: b.colors.filter((o) => o.label.trim()),
        decorations: b.decorations.filter((o) => o.label.trim()),
      };
      setResult(await saveSettingsSection("builder", values));
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={b.enabled} onChange={(e) => set("enabled", e.target.checked)} className="size-4 accent-blush-600" />
          <span className="font-medium">Personalizador activo en la web</span>
        </label>
        <label className="block">
          <span className="label">Texto de introducción</span>
          <textarea className="input" rows={2} value={b.intro} onChange={(e) => set("intro", e.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Antelación mínima (horas)</span>
            <input type="number" className="input" value={b.leadTimeHours} onChange={(e) => set("leadTimeHours", Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="label">Máximo de colores</span>
            <input type="number" min={1} max={10} className="input" value={b.maxColors} onChange={(e) => set("maxColors", Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="label">Caracteres máx. del texto</span>
            <input type="number" className="input" value={b.textMaxLength} onChange={(e) => set("textMaxLength", Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="label">Precio del texto escrito</span>
            <Money value={b.textPriceCents} onChange={(c) => set("textPriceCents", c)} />
          </label>
          <label className="flex items-center gap-3 self-end pb-3 text-sm sm:col-span-2">
            <input type="checkbox" checked={b.photoReferenceEnabled} onChange={(e) => set("photoReferenceEnabled", e.target.checked)} className="size-4 accent-blush-600" />
            Permitir subir foto de inspiración
          </label>
        </div>
        <label className="block">
          <span className="label">Tipos de celebración (separados por comas)</span>
          <input className="input" value={celebrations} onChange={(e) => setCelebrations(e.target.value)} />
        </label>
      </section>

      <section className="rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft">
        <h2 className="font-semibold text-cocoa-900">Tamaños y precio base</h2>
        <p className="text-xs text-cocoa-500">El precio de la tarta = precio del tamaño + suplementos de las opciones elegidas.</p>
        <div className="mt-3 space-y-2">
          {b.sizes.map((s, i) => (
            <div key={s.id || i} className="flex flex-wrap items-center gap-2">
              <input className="input w-36 py-2" value={s.label} onChange={(e) => updateSize(i, { label: e.target.value, id: s.id || slugify(e.target.value) })} placeholder="Ø 18 cm" />
              <input className="input min-w-36 flex-1 py-2" value={s.servings} onChange={(e) => updateSize(i, { servings: e.target.value })} placeholder="10-12 personas" />
              <div className="w-28">
                <Money value={s.priceCents} onChange={(c) => updateSize(i, { priceCents: c })} />
              </div>
              <button type="button" onClick={() => set("sizes", b.sizes.filter((_, idx) => idx !== i))} className="btn-ghost size-10 p-0" aria-label="Quitar tamaño">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => set("sizes", [...b.sizes, { id: `t-${Date.now().toString(36)}`, label: "", servings: "", priceCents: 0 }])}>
            <Plus className="size-4" /> Añadir tamaño
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <OptionList title="Sabores de bizcocho" items={b.sponges} onChange={(v) => set("sponges", v)} />
        <OptionList title="Rellenos" items={b.fillings} onChange={(v) => set("fillings", v)} />
        <OptionList title="Coberturas" items={b.coverings} onChange={(v) => set("coverings", v)} />
        <OptionList title="Colores" hint="El cliente elige hasta el máximo indicado." items={b.colors} onChange={(v) => set("colors", v)} withColor />
      </div>
      <OptionList
        title="Decoraciones"
        hint="Marca «Presupuesto» en las que necesitan valoración manual: el cliente no podrá pagarlas directamente y te pedirá presupuesto."
        items={b.decorations}
        onChange={(v) => set("decorations", v)}
        withQuote
      />

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-sand-300 bg-white/95 p-3 shadow-lift backdrop-blur lg:bottom-4">
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin" />} Guardar personalizador
        </button>
        <ResultMessage result={result} />
      </div>
    </div>
  );
}
