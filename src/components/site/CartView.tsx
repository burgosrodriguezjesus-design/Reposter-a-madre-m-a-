"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { cart, useCart } from "@/lib/cart-store";
import type { CartLine } from "@/lib/cart-types";
import { formatPrice } from "@/lib/format";

function LineImage({ line }: { line: CartLine }) {
  return (
    <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-cream-200 sm:size-24">
      {line.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={line.image} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-3xl">🎂</div>
      )}
    </div>
  );
}

export function CartView() {
  const { lines, subtotalCents, count } = useCart();
  const [recovered, setRecovered] = useState<string | null>(null);

  // Recuperación de carrito desde el email de recordatorio (?recuperar=token)
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("recuperar");
    if (!token) return;
    fetch(`/api/cart/recover?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { lines?: CartLine[] } | null) => {
        if (data?.lines?.length) {
          cart.replace(data.lines);
          setRecovered("Hemos recuperado tu carrito tal y como lo dejaste.");
        }
        window.history.replaceState(null, "", "/carrito");
      })
      .catch(() => undefined);
  }, []);

  if (lines.length === 0) {
    return (
      <div className="mt-10 rounded-sm border border-dashed border-sand-400 bg-white/60 px-6 py-16 text-center">
        <ShoppingBag className="mx-auto size-12 text-blush-400" strokeWidth={1.4} />
        <p className="mt-4 font-display text-2xl text-cocoa-900">Tu carrito está vacío</p>
        <p className="mt-2 text-cocoa-600">Descubre nuestras tartas y dulces o diseña la tuya.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/productos" className="btn-primary">
            Ver productos
          </Link>
          <Link href="/personalizar-tarta" className="btn-outline">
            Personalizar tarta
          </Link>
        </div>
      </div>
    );
  }

  const maxLead = Math.max(...lines.map((l) => l.leadTimeHours));

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        {recovered && <p className="mb-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">{recovered}</p>}
        <ul className="divide-y divide-sand-300/60 rounded-3xl border border-sand-300/60 bg-white px-4 shadow-soft sm:px-6">
          {lines.map((line) => (
            <li key={line.key} className="flex gap-4 py-5">
              <LineImage line={line} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    {line.slug ? (
                      <Link href={`/producto/${line.slug}`} className="font-display text-lg leading-snug text-cocoa-900 hover:text-blush-700">
                        {line.name}
                      </Link>
                    ) : (
                      <p className="font-display text-lg leading-snug text-cocoa-900">{line.name}</p>
                    )}
                    {line.variantLabel && <p className="text-sm text-cocoa-600">{line.variantLabel}</p>}
                  </div>
                  <p className="shrink-0 font-semibold text-cocoa-900">{formatPrice(line.unitPriceCents * line.quantity)}</p>
                </div>
                {(line.optionLabels.length > 0 || line.dedication || line.referencePhotoUrl) && (
                  <ul className="mt-1.5 space-y-0.5 text-sm text-cocoa-500">
                    {line.optionLabels.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                    {line.dedication && <li>Dedicatoria: «{line.dedication}»</li>}
                    {line.referencePhotoUrl && <li>Con foto de referencia</li>}
                  </ul>
                )}
                <div className="mt-3 flex items-center justify-between">
                  {line.kind === "product" ? (
                    <div className="flex items-center rounded-full border border-sand-300">
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-full hover:bg-cream-200"
                        onClick={() => cart.setQuantity(line.key, line.quantity - 1)}
                        aria-label={`Quitar una unidad de ${line.name}`}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-full hover:bg-cream-200 disabled:opacity-40"
                        onClick={() => cart.setQuantity(line.key, line.quantity + 1)}
                        disabled={line.quantity >= line.maxPerOrder}
                        aria-label={`Añadir una unidad de ${line.name}`}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="badge bg-blush-100 text-blush-800">Tarta personalizada</span>
                  )}
                  <button type="button" onClick={() => cart.remove(line.key)} className="btn-ghost btn-sm text-cocoa-500">
                    <Trash2 className="size-4" /> Eliminar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Link href="/productos" className="btn-ghost mt-4">
          ← Seguir comprando
        </Link>
      </div>

      <aside className="card h-fit p-6 lg:sticky lg:top-28">
        <h2 className="font-display text-2xl text-cocoa-900">Resumen</h2>
        <dl className="mt-4 space-y-2 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-cocoa-600">Productos ({count})</dt>
            <dd className="font-semibold">{formatPrice(subtotalCents)}</dd>
          </div>
          <div className="flex justify-between text-sm text-cocoa-500">
            <dt>Envío y descuentos</dt>
            <dd>en el siguiente paso</dd>
          </div>
        </dl>
        <p className="mt-4 rounded-2xl bg-cream-100 p-3 text-sm text-cocoa-600">
          Este pedido necesita al menos <strong>{maxLead >= 48 ? `${Math.round(maxLead / 24)} días` : `${maxLead} h`}</strong> de
          antelación. En el siguiente paso eliges día y hora.
        </p>
        <Link href="/finalizar-pedido" className="btn-primary mt-5 w-full py-3.5 text-base">
          Tramitar pedido <ArrowRight className="size-4" />
        </Link>
      </aside>
    </div>
  );
}
