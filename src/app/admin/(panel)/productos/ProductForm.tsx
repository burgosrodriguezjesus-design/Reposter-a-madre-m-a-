"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { ResultMessage, type ActionResult } from "@/components/admin/forms";
import { ALLERGENS, OCCASIONS } from "@/lib/allergens";
import { slugify } from "@/lib/format";
import type { OptionGroup } from "@/lib/pricing";
import { saveProduct, type ProductPayload } from "./actions";

type Variant = { id?: string; name: string; servings?: string; priceCents: number };

function euros(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
function toCents(value: string) {
  const n = Math.round(Number.parseFloat(value.replace(",", ".")) * 100);
  return Number.isFinite(n) ? n : 0;
}

function PriceInput({ cents, onChange, allowNegative = false }: { cents: number; onChange: (c: number) => void; allowNegative?: boolean }) {
  const [text, setText] = useState(euros(cents));
  return (
    <div className="relative">
      <input
        className="input pr-7"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(allowNegative ? /[^\d,.-]/g : /[^\d,.]/g, "");
          setText(v);
          onChange(toCents(v));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-cocoa-500">€</span>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft sm:p-6">
      <h2 className="text-lg font-semibold text-cocoa-900">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-cocoa-500">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-sand-300/70 bg-cream-50 p-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" />
      <span>
        <span className="font-medium text-cocoa-900">{label}</span>
        {hint && <span className="block text-xs text-cocoa-500">{hint}</span>}
      </span>
    </label>
  );
}

export function ProductForm({ initial, categories }: { initial: ProductPayload & { id?: string }; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ProductPayload>(key: K, value: ProductPayload[K]) => setP((prev) => ({ ...prev, [key]: value }));
  const variants = (p.variants ?? []) as Variant[];
  const groups = (p.optionGroups ?? []) as OptionGroup[];

  const toggleIn = (key: "allergens" | "mayContain" | "occasions", value: string) => {
    const list = (p[key] ?? []) as string[];
    set(key, list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveProduct(p);
      setResult(res);
      if (res.ok && !initial.id && res.id) router.push(`/admin/productos/${res.id}?nuevo=1`);
      else if (res.ok) router.refresh();
    });
  }

  const updateVariant = (i: number, patch: Partial<Variant>) => set("variants", variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const updateGroup = (i: number, patch: Partial<OptionGroup>) => set("optionGroups", groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Información básica">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">Nombre</span>
            <input
              className="input"
              required
              value={p.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
            />
          </label>
          <label className="block">
            <span className="label">URL del producto</span>
            <div className="flex items-center rounded-xl border border-sand-300 bg-cream-50 pl-3 text-sm text-cocoa-500 focus-within:border-blush-500">
              /producto/
              <input
                className="w-full rounded-r-xl border-0 bg-white px-2 py-2.5 text-[15px] text-cocoa-900 focus:outline-none"
                value={p.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", slugify(e.target.value));
                }}
              />
            </div>
            <span className="mt-1 block text-xs text-cocoa-500">Corta y descriptiva. Cambiarla después afecta al SEO.</span>
          </label>
          <label className="block">
            <span className="label">Categoría</span>
            <select className="input" required value={p.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Elige…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Descripción corta</span>
            <input className="input" maxLength={240} value={p.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
            <span className="mt-1 block text-xs text-cocoa-500">Se muestra en las tarjetas del catálogo.</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Descripción completa</span>
            <textarea className="input" rows={6} value={p.description} onChange={(e) => set("description", e.target.value)} />
            <span className="mt-1 block text-xs text-cocoa-500">Separa los párrafos con una línea en blanco. Escribe texto propio: ayuda a aparecer en Google.</span>
          </label>
        </div>
      </Section>

      <Section title="Precio y tamaños" hint="Si añades tamaños, el precio de cada tamaño sustituye al precio base.">
        <label className="block max-w-xs">
          <span className="label">Precio base (IVA incluido)</span>
          <PriceInput cents={p.priceCents} onChange={(c) => set("priceCents", c)} />
        </label>
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div key={v.id ?? `new-${i}`} className="grid grid-cols-[1fr_1fr_110px_auto] items-end gap-2">
              <label>
                <span className="label text-xs">Tamaño</span>
                <input className="input" value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} placeholder="Ø 18 cm" required />
              </label>
              <label>
                <span className="label text-xs">Raciones</span>
                <input className="input" value={v.servings ?? ""} onChange={(e) => updateVariant(i, { servings: e.target.value })} placeholder="10-12 raciones" />
              </label>
              <label>
                <span className="label text-xs">Precio</span>
                <PriceInput cents={v.priceCents} onChange={(c) => updateVariant(i, { priceCents: c })} />
              </label>
              <button type="button" className="btn-ghost size-11 p-0" onClick={() => set("variants", variants.filter((_, idx) => idx !== i))} aria-label="Quitar tamaño">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button type="button" className="btn-outline btn-sm" onClick={() => set("variants", [...variants, { name: "", servings: "", priceCents: p.priceCents }])}>
            <Plus className="size-4" /> Añadir tamaño
          </button>
        </div>
      </Section>

      <Section title="Opciones de personalización" hint="Por ejemplo: sabor del bizcocho, cobertura o extras. Cada opción puede sumar precio.">
        {groups.map((g, gi) => (
          <div key={gi} className="rounded-xl border border-sand-300/70 bg-cream-50 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1">
                <span className="label text-xs">Nombre del grupo</span>
                <input className="input" value={g.name} required onChange={(e) => updateGroup(gi, { name: e.target.value, id: g.id || slugify(e.target.value) || `g${gi}` })} placeholder="Sabor del bizcocho" />
              </label>
              <label className="flex items-center gap-2 pb-3 text-sm">
                <input type="checkbox" checked={g.required} onChange={(e) => updateGroup(gi, { required: e.target.checked })} className="size-4 accent-blush-600" /> Obligatorio
              </label>
              <label className="flex items-center gap-2 pb-3 text-sm">
                <input type="checkbox" checked={g.multiple} onChange={(e) => updateGroup(gi, { multiple: e.target.checked })} className="size-4 accent-blush-600" /> Varias a la vez
              </label>
              <button type="button" className="btn-ghost size-11 p-0" onClick={() => set("optionGroups", groups.filter((_, idx) => idx !== gi))} aria-label="Quitar grupo">
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {g.choices.map((c, ci) => (
                <div key={ci} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
                  <input
                    className="input"
                    value={c.label}
                    required
                    placeholder="Opción"
                    onChange={(e) =>
                      updateGroup(gi, { choices: g.choices.map((x, idx) => (idx === ci ? { ...x, label: e.target.value, id: x.id || slugify(e.target.value) || `c${ci}` } : x)) })
                    }
                  />
                  <PriceInput
                    cents={c.priceDeltaCents}
                    allowNegative
                    onChange={(cents) => updateGroup(gi, { choices: g.choices.map((x, idx) => (idx === ci ? { ...x, priceDeltaCents: cents } : x)) })}
                  />
                  <button type="button" className="btn-ghost size-11 p-0" onClick={() => updateGroup(gi, { choices: g.choices.filter((_, idx) => idx !== ci) })} aria-label="Quitar opción">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={() => updateGroup(gi, { choices: [...g.choices, { id: `c${Date.now().toString(36)}`, label: "", priceDeltaCents: 0 }] })}>
                <Plus className="size-4" /> Añadir opción
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => set("optionGroups", [...groups, { id: `g${Date.now().toString(36)}`, name: "", required: false, multiple: false, choices: [{ id: `c${Date.now().toString(36)}`, label: "", priceDeltaCents: 0 }] }])}
        >
          <Plus className="size-4" /> Añadir grupo de opciones
        </button>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={!!p.allowDedication} onChange={(v) => set("allowDedication", v)} label="Permitir dedicatoria" hint="El cliente puede escribir un mensaje" />
          <Toggle checked={!!p.allowReferencePhoto} onChange={(v) => set("allowReferencePhoto", v)} label="Permitir foto de referencia" hint="El cliente puede subir una imagen" />
        </div>
      </Section>

      <Section title="Ingredientes y alérgenos" hint="Obligatorio informar de los 14 alérgenos (Reglamento UE 1169/2011).">
        <label className="block">
          <span className="label">Ingredientes</span>
          <textarea className="input" rows={3} value={p.ingredients} onChange={(e) => set("ingredients", e.target.value)} />
        </label>
        <div>
          <p className="label">Contiene</p>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => (
              <button type="button" key={a.key} onClick={() => toggleIn("allergens", a.key)} className={clsx("chip", (p.allergens ?? []).includes(a.key) && "chip-active")}>
                {a.emoji} {a.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">Puede contener trazas de</p>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => (
              <button type="button" key={a.key} onClick={() => toggleIn("mayContain", a.key)} className={clsx("chip", (p.mayContain ?? []).includes(a.key) && "border-cocoa-600 bg-cocoa-600 text-white")}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Disponibilidad y pedidos">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Disponibilidad</span>
            <select className="input" value={p.availability} onChange={(e) => set("availability", e.target.value as ProductPayload["availability"])}>
              <option value="AVAILABLE">Disponible</option>
              <option value="ON_DEMAND">Solo por encargo</option>
              <option value="SEASONAL">De temporada</option>
              <option value="SOLD_OUT">Agotado (no se puede pedir)</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Antelación mínima (horas)</span>
            <input type="number" min={0} className="input" value={p.leadTimeHours} onChange={(e) => set("leadTimeHours", Number(e.target.value))} />
            <span className="mt-1 block text-xs text-cocoa-500">48 = 2 días · 168 = 1 semana</span>
          </label>
          <label className="block">
            <span className="label">Máximo por pedido</span>
            <input type="number" min={1} max={50} className="input" value={p.maxPerOrder} onChange={(e) => set("maxPerOrder", Number(e.target.value))} />
          </label>
        </div>
        <div>
          <p className="label">Ocasiones (para los filtros del catálogo)</p>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <button type="button" key={o.key} onClick={() => toggleIn("occasions", o.key)} className={clsx("chip", (p.occasions ?? []).includes(o.key) && "chip-active")}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle checked={!!p.active} onChange={(v) => set("active", v)} label="Visible en la web" />
          <Toggle checked={!!p.featured} onChange={(v) => set("featured", v)} label="Destacado / más vendido" />
          <Toggle checked={!!p.isNew} onChange={(v) => set("isNew", v)} label="Novedad" />
        </div>
        <label className="block max-w-xs">
          <span className="label">Ajuste de popularidad</span>
          <input type="number" min={-100} max={100} className="input" value={p.popularityBoost} onChange={(e) => set("popularityBoost", Number(e.target.value))} />
          <span className="mt-1 block text-xs text-cocoa-500">Se suma a las ventas reales para ordenar «Más populares».</span>
        </label>
      </Section>

      <Section title="SEO (opcional)" hint="Si lo dejas vacío se genera automáticamente con el nombre, la ciudad y la descripción.">
        <label className="block">
          <span className="label">Título para Google ({(p.seoTitle ?? "").length}/70)</span>
          <input className="input" maxLength={70} value={p.seoTitle ?? ""} onChange={(e) => set("seoTitle", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Metadescripción ({(p.seoDescription ?? "").length}/170)</span>
          <textarea className="input" rows={2} maxLength={170} value={p.seoDescription ?? ""} onChange={(e) => set("seoDescription", e.target.value)} />
        </label>
      </Section>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-sand-300 bg-white/95 p-3 shadow-lift backdrop-blur lg:bottom-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin" />} {initial.id ? "Guardar cambios" : "Crear producto"}
        </button>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
