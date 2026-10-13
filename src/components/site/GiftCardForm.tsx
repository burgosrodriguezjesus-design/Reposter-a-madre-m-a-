"use client";

import Link from "next/link";
import { useState } from "react";
import { Gift, LoaderCircle } from "lucide-react";
import clsx from "clsx";
import { formatPrice } from "@/lib/format";

export function GiftCardForm({ amounts, payments, businessName }: { amounts: number[]; payments: { card: boolean; inStore: boolean }; businessName: string }) {
  const [amount, setAmount] = useState(amounts[1] ?? amounts[0]);
  const [form, setForm] = useState({ purchaserName: "", purchaserEmail: "", recipientName: "", recipientEmail: "", message: "" });
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "IN_STORE">(payments.card ? "CARD" : "IN_STORE");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reserved, setReserved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/giftcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountCents: amount, paymentMethod, acceptTerms: terms }),
      });
      const data = (await res.json()) as { redirectUrl?: string; reserved?: boolean; error?: string };
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      if (data.reserved) setReserved(true);
      else setError(data.error || "No se pudo completar");
    } catch {
      setError("Error de conexión");
    }
    setBusy(false);
  }

  if (reserved) {
    return (
      <div className="card p-8 text-center">
        <Gift className="mx-auto size-12 text-blush-600" />
        <p className="mt-4 font-display text-2xl text-cocoa-900">¡Tarjeta reservada!</p>
        <p className="mt-2 text-cocoa-600">Pasa por la tienda para pagarla. En cuanto la cobremos la activamos y os enviamos el código por email.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="card space-y-6 p-6 sm:p-8">
        <fieldset>
          <legend className="label">Importe</legend>
          <div className="flex flex-wrap gap-2">
            {amounts.map((a) => (
              <button key={a} type="button" onClick={() => setAmount(a)} aria-pressed={amount === a} className={clsx("chip px-5 py-2 text-base", amount === a && "chip-active")}>
                {formatPrice(a)}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="gc-pn">
              Tu nombre
            </label>
            <input id="gc-pn" required className="input" value={form.purchaserName} onChange={(e) => setForm({ ...form, purchaserName: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="gc-pe">
              Tu email
            </label>
            <input id="gc-pe" type="email" required className="input" value={form.purchaserEmail} onChange={(e) => setForm({ ...form, purchaserEmail: e.target.value.trim() })} />
          </div>
          <div>
            <label className="label" htmlFor="gc-rn">
              Para (nombre) <span className="font-normal text-cocoa-500">(opcional)</span>
            </label>
            <input id="gc-rn" className="input" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="gc-re">
              Email de quien la recibe <span className="font-normal text-cocoa-500">(opcional)</span>
            </label>
            <input id="gc-re" type="email" className="input" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value.trim() })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="gc-msg">
              Mensaje <span className="font-normal text-cocoa-500">(opcional)</span>
            </label>
            <textarea id="gc-msg" rows={3} maxLength={300} className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="¡Feliz cumpleaños! Date un capricho dulce." />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {payments.card && (
            <button type="button" onClick={() => setPaymentMethod("CARD")} className={clsx("rounded-2xl border p-4 text-left", paymentMethod === "CARD" ? "border-blush-600 bg-blush-50" : "border-sand-300 bg-white")}>
              <strong className="block">Pagar online</strong>
              <span className="text-sm text-cocoa-600">La recibís al momento por email</span>
            </button>
          )}
          {payments.inStore && (
            <button type="button" onClick={() => setPaymentMethod("IN_STORE")} className={clsx("rounded-2xl border p-4 text-left", paymentMethod === "IN_STORE" ? "border-blush-600 bg-blush-50" : "border-sand-300 bg-white")}>
              <strong className="block">Reservar y pagar en tienda</strong>
              <span className="text-sm text-cocoa-600">Se activa al pagarla</span>
            </button>
          )}
        </div>
        <label className="flex items-start gap-3 text-sm text-cocoa-700">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" />
          <span>
            Acepto las{" "}
            <Link href="/condiciones-de-compra" target="_blank" className="font-medium text-blush-700 underline">
              condiciones de compra
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" target="_blank" className="font-medium text-blush-700 underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy || !terms || !form.purchaserName || !form.purchaserEmail}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {paymentMethod === "CARD" ? `Pagar ${formatPrice(amount)}` : "Reservar tarjeta"}
        </button>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="relative overflow-hidden rounded-sm border border-gold-400 bg-gradient-to-br from-blush-200 via-cream-50 to-gold-200 p-8 shadow-lift">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/40" aria-hidden />
          <p className="text-xs font-semibold tracking-[0.25em] text-gold-700 uppercase">Tarjeta regalo</p>
          <p className="mt-2 font-display text-2xl italic text-cocoa-900">{businessName}</p>
          <p className="mt-10 font-display text-6xl text-cocoa-900">{formatPrice(amount)}</p>
          {form.recipientName && <p className="mt-4 text-cocoa-700">Para {form.recipientName}</p>}
          {form.message && <p className="mt-2 text-sm italic text-cocoa-600">«{form.message}»</p>}
          <p className="mt-8 font-mono tracking-[0.3em] text-cocoa-500">XXXX-XXXX-XXXX</p>
        </div>
      </aside>
    </form>
  );
}
