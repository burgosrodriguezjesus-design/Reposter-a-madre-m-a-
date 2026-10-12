"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Check, LoaderCircle, MessageSquareQuote, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import type { BuilderOption, BuilderSettings } from "@/lib/settings-types";
import { priceCustomCake, type CustomCakeSpec } from "@/lib/pricing";
import { cart } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { CakePreview } from "@/components/site/builder/CakePreview";
import { PhotoUpload } from "@/components/site/PhotoUpload";
import { DateTimePicker } from "@/components/site/checkout/DateTimePicker";

function OptionChips({
  options,
  selected,
  onSelect,
  multiple = false,
}: {
  options: BuilderOption[];
  selected: string[];
  onSelect: (id: string) => void;
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role={multiple ? "group" : "radiogroup"}>
      {options.map((o) => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            aria-pressed={active}
            className={clsx("chip", active && "chip-active")}
          >
            {active && <Check className="size-3.5" />}
            {o.label}
            {o.requiresQuote ? (
              <span className={active ? "text-white/80" : "text-gold-700"}>· presupuesto</span>
            ) : o.priceDeltaCents ? (
              <span className={active ? "text-white/80" : "text-cocoa-500"}>+{formatPrice(o.priceDeltaCents)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Block({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-sand-300/60 py-6 first:pt-0 last:border-0">
      <h2 className="flex items-baseline gap-3 font-display text-xl text-cocoa-900">
        <span className="font-sans text-sm font-bold text-gold-700">{String(n).padStart(2, "0")}</span> {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-cocoa-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CakeBuilder({ builder, quoteLeadHours }: { builder: BuilderSettings; quoteLeadHours: number }) {
  const [spec, setSpec] = useState<CustomCakeSpec>({
    celebration: builder.celebrations[0] ?? "",
    sizeId: builder.sizes[1]?.id ?? builder.sizes[0]?.id ?? "",
    spongeId: builder.sponges[0]?.id ?? "",
    fillingId: builder.fillings[0]?.id ?? "",
    coveringId: builder.coverings[0]?.id ?? "",
    colorIds: builder.colors[1] ? [builder.colors[1].id] : [],
    decorationIds: [],
    text: "",
  });
  const [photo, setPhoto] = useState<string | undefined>();
  const [mode, setMode] = useState<"build" | "quote" | "added" | "quoted">("build");
  const [quote, setQuote] = useState({ name: "", email: "", phone: "", notes: "", fulfillment: "PICKUP" as "PICKUP" | "DELIVERY" });
  const [desired, setDesired] = useState({ date: "", time: "" });
  const [privacy, setPrivacy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);

  const priced = useMemo(() => priceCustomCake(builder, spec), [builder, spec]);
  const update = (patch: Partial<CustomCakeSpec>) => {
    setSpec((s) => ({ ...s, ...patch }));
    if (mode === "added") setMode("build");
  };
  const toggleIn = (key: "colorIds" | "decorationIds", id: string, max?: number) => {
    const list = spec[key];
    if (list.includes(id)) update({ [key]: list.filter((x) => x !== id) });
    else if (!max || list.length < max) update({ [key]: [...list, id] });
    else update({ [key]: [...list.slice(1), id] });
  };
  const onDesired = useCallback((v: { date: string; time: string }) => setDesired(v), []);

  const size = builder.sizes.find((s) => s.id === spec.sizeId);
  const colorHexes = spec.colorIds.map((id) => builder.colors.find((c) => c.id === id)?.hex ?? "#F6D9DE");

  function addToCart() {
    if (!priced.ok || priced.requiresQuote) return;
    cart.add({
      kind: "custom",
      name: `Tarta personalizada${spec.celebration ? ` · ${spec.celebration}` : ""}`,
      image: photo ?? "/demo/tarta-personalizada-nombre.svg",
      variantLabel: size ? `${size.label} · ${size.servings}` : undefined,
      options: {},
      optionLabels: priced.summary.filter((s) => !["Celebración", "Tamaño"].includes(s.label)).map((s) => `${s.label}: ${s.value}`),
      referencePhotoUrl: photo,
      quantity: 1,
      unitPriceCents: priced.priceCents,
      maxPerOrder: 1,
      leadTimeHours: quoteLeadHours,
      spec,
    });
    setMode("added");
  }

  async function sendQuote(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec,
          desiredDate: desired.date,
          fulfillment: quote.fulfillment,
          customer: { name: quote.name, email: quote.email, phone: quote.phone },
          notes: quote.notes || undefined,
          referencePhotoUrl: photo,
          acceptPrivacy: privacy,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo enviar la solicitud");
      setQuoteLink(data.url ?? null);
      setMode("quoted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la solicitud");
    } finally {
      setSending(false);
    }
  }

  if (mode === "quoted") {
    return (
      <div className="card mx-auto max-w-2xl p-8 text-center">
        <MessageSquareQuote className="mx-auto size-12 text-blush-600" strokeWidth={1.5} />
        <h2 className="mt-4 font-display text-3xl text-cocoa-900">¡Solicitud enviada!</h2>
        <p className="mt-3 text-cocoa-600">
          Revisamos tu diseño y te enviaremos el precio final por email en menos de 24 h laborables. Desde el enlace del email podrás
          confirmar y pagar la tarta.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {quoteLink && (
            <Link href={quoteLink} className="btn-primary">
              Ver mi solicitud
            </Link>
          )}
          <Link href="/productos" className="btn-outline">
            Seguir viendo productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <div className="card p-5 sm:p-8">
        <Block n={1} title="¿Qué celebráis?">
          <OptionChips
            options={builder.celebrations.map((c) => ({ id: c, label: c, priceDeltaCents: 0 }))}
            selected={[spec.celebration]}
            onSelect={(id) => update({ celebration: id })}
          />
        </Block>
        <Block n={2} title="Tamaño y número de personas">
          <div className="grid gap-2 sm:grid-cols-2">
            {builder.sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update({ sizeId: s.id })}
                aria-pressed={spec.sizeId === s.id}
                className={clsx(
                  "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                  spec.sizeId === s.id ? "border-blush-600 bg-blush-50 ring-2 ring-blush-200" : "border-sand-300 bg-white hover:border-blush-300",
                )}
              >
                <span>
                  <strong className="block text-cocoa-900">{s.label}</strong>
                  <span className="text-sm text-cocoa-500">{s.servings}</span>
                </span>
                <span className="text-sm font-semibold text-cocoa-800">desde {formatPrice(s.priceCents)}</span>
              </button>
            ))}
          </div>
        </Block>
        <Block n={3} title="Sabor del bizcocho">
          <OptionChips options={builder.sponges} selected={[spec.spongeId]} onSelect={(id) => update({ spongeId: id })} />
        </Block>
        <Block n={4} title="Relleno">
          <OptionChips options={builder.fillings} selected={[spec.fillingId]} onSelect={(id) => update({ fillingId: id })} />
        </Block>
        <Block n={5} title="Cobertura">
          <OptionChips options={builder.coverings} selected={[spec.coveringId]} onSelect={(id) => update({ coveringId: id })} />
        </Block>
        <Block n={6} title="Colores" hint={`Elige hasta ${builder.maxColors}. El primero será el color principal.`}>
          <div className="flex flex-wrap gap-3">
            {builder.colors.map((c) => {
              const index = spec.colorIds.indexOf(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleIn("colorIds", c.id, builder.maxColors)}
                  aria-pressed={index >= 0}
                  className="group flex w-20 flex-col items-center gap-1.5 text-center text-xs text-cocoa-700"
                >
                  <span
                    className={clsx(
                      "relative inline-flex size-12 items-center justify-center rounded-full border-2 shadow-soft transition",
                      index >= 0 ? "border-blush-600 ring-4 ring-blush-200" : "border-white group-hover:scale-105",
                    )}
                    style={{ background: c.hex }}
                  >
                    {index >= 0 && <span className="rounded-full bg-white/90 px-1.5 text-[11px] font-bold text-blush-700">{index + 1}</span>}
                  </span>
                  {c.label}
                  {c.priceDeltaCents > 0 && <span className="text-cocoa-500">+{formatPrice(c.priceDeltaCents)}</span>}
                </button>
              );
            })}
          </div>
        </Block>
        <Block n={7} title="Decoración" hint="Puedes combinar varias. Las marcadas como «presupuesto» las valoramos a mano.">
          <OptionChips options={builder.decorations} selected={spec.decorationIds} onSelect={(id) => toggleIn("decorationIds", id)} multiple />
        </Block>
        <Block n={8} title="Texto en la tarta" hint="Opcional. Lo escribimos a mano con chocolate o en el topper.">
          <input
            className="input"
            maxLength={builder.textMaxLength}
            value={spec.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="¡Feliz cumpleaños, Martina!"
          />
          <p className="mt-1 text-xs text-cocoa-500">
            {spec.text.length}/{builder.textMaxLength}
            {builder.textPriceCents ? ` · +${formatPrice(builder.textPriceCents)}` : ""}
          </p>
        </Block>
        {builder.photoReferenceEnabled && (
          <Block n={9} title="Foto de inspiración">
            <PhotoUpload value={photo} onChange={setPhoto} label="Sube una imagen de referencia (opcional)" hint="Una tarta que te guste, la temática, un personaje…" />
          </Block>
        )}
        <Block n={builder.photoReferenceEnabled ? 10 : 9} title="Fecha de recogida o entrega">
          <p className="text-sm text-cocoa-600">
            Elegirás el día y la hora al finalizar el pedido (o en la solicitud de presupuesto). Las tartas personalizadas necesitan al
            menos <strong>{Math.round(quoteLeadHours / 24)} días</strong> de antelación.
          </p>
        </Block>
      </div>

      {/* Resumen con vista previa */}
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="card overflow-hidden">
          <CakePreview
            colors={colorHexes}
            spongeId={spec.spongeId}
            coveringId={spec.coveringId}
            decorationIds={spec.decorationIds}
            text={spec.text}
            tiers={size?.label.toLowerCase().includes("pisos") ? 2 : 1}
          />
          <div className="p-6">
            {priced.ok ? (
              <>
                <p className="text-sm text-cocoa-500">{priced.requiresQuote ? "Precio orientativo desde" : "Precio estimado"}</p>
                <p className="font-display text-4xl text-cocoa-900">{formatPrice(priced.priceCents)}</p>
                <dl className="mt-4 space-y-1.5 text-sm">
                  {priced.summary.map((s) => (
                    <div key={s.label} className="flex justify-between gap-4">
                      <dt className="text-cocoa-500">{s.label}</dt>
                      <dd className="text-right text-cocoa-800">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-sm text-red-700">{priced.error}</p>
            )}

            {mode === "added" ? (
              <div className="mt-5 space-y-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
                <p className="flex items-center gap-2 font-semibold">
                  <Check className="size-4" /> Tarta añadida al carrito
                </p>
                <Link href="/carrito" className="btn-primary btn-sm w-full">
                  Ver carrito y elegir fecha
                </Link>
              </div>
            ) : (
              <div className="mt-5 space-y-2">
                {priced.ok && !priced.requiresQuote && (
                  <button type="button" className="btn-primary w-full py-3.5" onClick={addToCart}>
                    <ShoppingBag className="size-4" /> Añadir al carrito
                  </button>
                )}
                {priced.ok && priced.requiresQuote && (
                  <p className="rounded-2xl bg-gold-200/50 p-3 text-sm text-cocoa-700">
                    Tu diseño incluye elementos que valoramos a mano. Pide presupuesto y te diremos el precio final sin compromiso.
                  </p>
                )}
                <button
                  type="button"
                  className={priced.ok && priced.requiresQuote ? "btn-primary w-full py-3.5" : "btn-outline w-full"}
                  onClick={() => setMode("quote")}
                >
                  <MessageSquareQuote className="size-4" /> Solicitar presupuesto
                </button>
              </div>
            )}
            <p className="mt-3 text-xs text-cocoa-500">
              El precio se calcula con nuestras tarifas. Las tartas personalizadas se confirman tras revisarlas.
            </p>
          </div>
        </div>
      </aside>

      {mode === "quote" && (
        <form onSubmit={sendQuote} className="card p-5 sm:p-8 lg:col-span-2" id="presupuesto">
          <h2 className="font-display text-2xl text-cocoa-900">Solicitar presupuesto</h2>
          <p className="mt-1 text-sm text-cocoa-600">Sin compromiso: te respondemos con el precio final y, si te encaja, confirmas desde el enlace.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="q-name">
                Nombre
              </label>
              <input id="q-name" className="input" required value={quote.name} onChange={(e) => setQuote({ ...quote, name: e.target.value })} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="q-email">
                Email
              </label>
              <input id="q-email" type="email" className="input" required value={quote.email} onChange={(e) => setQuote({ ...quote, email: e.target.value.trim() })} autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="q-phone">
                Teléfono
              </label>
              <input id="q-phone" type="tel" className="input" required value={quote.phone} onChange={(e) => setQuote({ ...quote, phone: e.target.value })} autoComplete="tel" />
            </div>
          </div>
          <div className="mt-6">
            <p className="label">Fecha deseada</p>
            <DateTimePicker leadHours={quoteLeadHours} date={desired.date} time="" withTime={false} onChange={onDesired} />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <label className="label" htmlFor="q-ful">
                Recogida o entrega
              </label>
              <select id="q-ful" className="input" value={quote.fulfillment} onChange={(e) => setQuote({ ...quote, fulfillment: e.target.value as "PICKUP" | "DELIVERY" })}>
                <option value="PICKUP">Recogida en tienda</option>
                <option value="DELIVERY">Entrega a domicilio</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="q-notes">
                Cuéntanos tu idea
              </label>
              <textarea id="q-notes" rows={3} className="input" value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} placeholder="Temática, número de invitados, alergias, presupuesto aproximado…" />
            </div>
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm text-cocoa-700">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" required />
            <span>
              Acepto la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium text-blush-700 underline">
                política de privacidad
              </Link>{" "}
              para que podáis responder a mi solicitud.
            </span>
          </label>
          {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={sending || !desired.date || !privacy || !priced.ok}>
              {sending && <LoaderCircle className="size-4 animate-spin" />} Enviar solicitud
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMode("build")}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
