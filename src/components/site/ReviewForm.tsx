"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LoaderCircle, Star } from "lucide-react";

export function ReviewForm({ orderNumber }: { orderNumber?: string }) {
  const [rating, setRating] = useState(5);
  const [form, setForm] = useState({ authorName: "", text: "", orderNumber: orderNumber ?? "", email: "" });
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Bloqueo inmediato ante un doble clic (el botón tarda un instante en desactivarse)
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rating, orderNumber: form.orderNumber || undefined, acceptPrivacy: privacy }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) setDone(true);
      else setError(data.error || "No se pudo enviar");
    } catch {
      setError("Error de conexión");
    }
    inFlight.current = false;
    setBusy(false);
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl text-cocoa-900">¡Muchas gracias!</p>
        <p className="mt-2 text-cocoa-600">Publicaremos tu opinión en cuanto la revisemos.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
      <h2 className="font-display text-2xl text-cocoa-900">Deja tu opinión</h2>
      <fieldset>
        <legend className="label">Valoración</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} estrellas`} aria-pressed={rating === n} className="p-1 text-gold-500">
              <Star className="size-8" fill={n <= rating ? "currentColor" : "none"} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="rv-name">
          Nombre (se mostrará así)
        </label>
        <input id="rv-name" required className="input" maxLength={60} value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} placeholder="Ej.: Laura G." />
      </div>
      <div>
        <label className="label" htmlFor="rv-text">
          Tu opinión
        </label>
        <textarea id="rv-text" required rows={4} maxLength={1500} className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rv-order">
            Nº de pedido <span className="font-normal text-cocoa-500">(opcional)</span>
          </label>
          <input id="rv-order" className="input uppercase" value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} placeholder="MM-XXXXXX" />
        </div>
        <div>
          <label className="label" htmlFor="rv-email">
            Email del pedido <span className="font-normal text-cocoa-500">(no se publica)</span>
          </label>
          <input id="rv-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value.trim() })} />
        </div>
      </div>
      <p className="text-xs text-cocoa-500">Si indicas tu número de pedido y email, tu opinión aparecerá como «pedido verificado».</p>
      <label className="flex items-start gap-3 text-sm text-cocoa-700">
        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" />
        <span>
          Acepto que se publique mi opinión con el nombre indicado según la{" "}
          <Link href="/privacidad" target="_blank" className="font-medium text-blush-700 underline">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <button type="submit" className="btn-primary" disabled={busy || !privacy}>
        {busy && <LoaderCircle className="size-4 animate-spin" />} Enviar opinión
      </button>
    </form>
  );
}
