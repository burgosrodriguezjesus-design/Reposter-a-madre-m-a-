"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import { cart } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { priceProductLine, type OptionGroup } from "@/lib/pricing";
import { PhotoUpload } from "@/components/site/PhotoUpload";

export type ConfigurableProduct = {
  id: string;
  slug: string;
  name: string;
  image?: string;
  priceCents: number;
  variants: { id: string; name: string; servings: string | null; priceCents: number }[];
  optionGroups: OptionGroup[];
  allowDedication: boolean;
  allowReferencePhoto: boolean;
  maxPerOrder: number;
  leadTimeHours: number;
  soldOut: boolean;
};

export function ProductConfigurator({ product }: { product: ConfigurableProduct }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? null);
  const [options, setOptions] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(product.optionGroups.filter((g) => g.required && !g.multiple && g.choices[0]).map((g) => [g.id, [g.choices[0].id]])),
  );
  const [quantity, setQuantity] = useState(1);
  const [dedication, setDedication] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [added, setAdded] = useState(false);

  const priced = useMemo(
    () => priceProductLine({ ...product, optionGroups: product.optionGroups }, { variantId, quantity, options }),
    [product, variantId, quantity, options],
  );

  function toggle(group: OptionGroup, choiceId: string) {
    setAdded(false);
    setOptions((prev) => {
      const current = prev[group.id] ?? [];
      if (!group.multiple) return { ...prev, [group.id]: current[0] === choiceId && !group.required ? [] : [choiceId] };
      return { ...prev, [group.id]: current.includes(choiceId) ? current.filter((c) => c !== choiceId) : [...current, choiceId] };
    });
  }

  function addToCart() {
    if (!priced.ok) return;
    const variant = product.variants.find((v) => v.id === variantId);
    cart.add({
      kind: "product",
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      variantId,
      variantLabel: variant ? `${variant.name}${variant.servings ? ` · ${variant.servings}` : ""}` : undefined,
      options,
      optionLabels: priced.options.map((o) => `${o.group}: ${o.choice}`),
      dedication: dedication.trim() || undefined,
      referencePhotoUrl: photo,
      quantity,
      unitPriceCents: priced.unitPriceCents,
      maxPerOrder: product.maxPerOrder,
      leadTimeHours: product.leadTimeHours,
    });
    setAdded(true);
  }

  return (
    <div className="space-y-6">
      {product.variants.length > 0 && (
        <fieldset>
          <legend className="label">Tamaño</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {product.variants.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => {
                  setVariantId(v.id);
                  setAdded(false);
                }}
                aria-pressed={variantId === v.id}
                className={clsx(
                  "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                  variantId === v.id ? "border-blush-600 bg-blush-50 ring-2 ring-blush-200" : "border-sand-300 bg-white hover:border-blush-300",
                )}
              >
                <span>
                  <strong className="block text-[15px] text-cocoa-900">{v.name}</strong>
                  {v.servings && <span className="text-sm text-cocoa-500">{v.servings}</span>}
                </span>
                <span className="font-semibold text-cocoa-900">{formatPrice(v.priceCents)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {product.optionGroups.map((group) => (
        <fieldset key={group.id}>
          <legend className="label">
            {group.name} {!group.required && <span className="font-normal text-cocoa-500">(opcional)</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.choices.map((choice) => {
              const active = (options[group.id] ?? []).includes(choice.id);
              return (
                <button
                  type="button"
                  key={choice.id}
                  onClick={() => toggle(group, choice.id)}
                  aria-pressed={active}
                  className={clsx("chip", active && "chip-active")}
                >
                  {active && <Check className="size-3.5" />}
                  {choice.label}
                  {choice.priceDeltaCents !== 0 && (
                    <span className={active ? "text-white/80" : "text-cocoa-500"}>
                      {choice.priceDeltaCents > 0 ? "+" : ""}
                      {formatPrice(choice.priceDeltaCents)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {product.allowDedication && (
        <div>
          <label htmlFor="dedicatoria" className="label">
            Dedicatoria o mensaje <span className="font-normal text-cocoa-500">(opcional)</span>
          </label>
          <input
            id="dedicatoria"
            className="input"
            maxLength={80}
            value={dedication}
            onChange={(e) => {
              setDedication(e.target.value);
              setAdded(false);
            }}
            placeholder="Ej.: ¡Feliz cumpleaños, Lucía!"
          />
          <p className="mt-1 text-xs text-cocoa-500">{dedication.length}/80 caracteres</p>
        </div>
      )}

      {product.allowReferencePhoto && (
        <PhotoUpload
          value={photo}
          onChange={(url) => {
            setPhoto(url);
            setAdded(false);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-sand-300/70 pt-6">
        <div className="flex items-center rounded-full border border-sand-300 bg-white">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-cream-200 disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Quitar una unidad"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center font-semibold" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-cream-200 disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.min(product.maxPerOrder, q + 1))}
            disabled={quantity >= product.maxPerOrder}
            aria-label="Añadir una unidad"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1">
          <p className="text-xs text-cocoa-500">Total</p>
          <p className="font-display text-3xl text-cocoa-900">{priced.ok ? formatPrice(priced.unitPriceCents * quantity) : "—"}</p>
        </div>
      </div>

      {!priced.ok && <p className="text-sm text-red-700">{priced.error}</p>}

      {product.soldOut ? (
        <button type="button" className="btn-dark w-full" disabled>
          Agotado temporalmente
        </button>
      ) : (
        <button type="button" className="btn-primary w-full py-3.5 text-base" onClick={addToCart} disabled={!priced.ok}>
          <ShoppingBag className="size-5" /> Añadir al carrito
        </button>
      )}

      {added && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center">
          <span className="flex flex-1 items-center gap-2">
            <Check className="size-5" /> ¡Añadido al carrito!
          </span>
          <span className="flex gap-2">
            <Link href="/productos" className="btn-outline btn-sm">
              Seguir comprando
            </Link>
            <Link href="/carrito" className="btn-primary btn-sm">
              Ver carrito
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
