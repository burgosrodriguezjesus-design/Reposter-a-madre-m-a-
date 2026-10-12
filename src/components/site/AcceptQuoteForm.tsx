"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CreditCard, LoaderCircle, Store } from "lucide-react";
import clsx from "clsx";
import { DateTimePicker } from "@/components/site/checkout/DateTimePicker";

export function AcceptQuoteForm({
  quoteId,
  token,
  fulfillment,
  payments,
  defaultCity,
}: {
  quoteId: string;
  token: string;
  fulfillment: "PICKUP" | "DELIVERY";
  payments: { card: boolean; inStore: boolean };
  defaultCity: string;
}) {
  const [slot, setSlot] = useState({ date: "", time: "" });
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "IN_STORE">(payments.card ? "CARD" : "IN_STORE");
  const [address, setAddress] = useState({ street: "", city: defaultCity, details: "" });
  const [postalCode, setPostalCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSlot = useCallback((v: { date: string; time: string }) => setSlot(v), []);
  const delivery = fulfillment === "DELIVERY";
  const canInStore = payments.inStore && !delivery;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          date: slot.date,
          time: slot.time,
          paymentMethod: canInStore ? paymentMethod : "CARD",
          postalCode: delivery ? postalCode : undefined,
          address: delivery ? address : undefined,
          acceptTerms: terms,
        }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (data.redirectUrl) {
        // Navegación completa: el enlace con el token se canjea por una cookie privada (ver proxy)
        window.location.assign(data.redirectUrl);
        return;
      }
      setError(data.error || "No se pudo confirmar");
    } catch {
      setError("Error de conexión");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6 sm:p-8">
      <h2 className="font-display text-2xl text-cocoa-900">Confirmar y reservar</h2>
      <div>
        <p className="label">Día y hora de {delivery ? "entrega" : "recogida"}</p>
        <DateTimePicker leadHours={0} date={slot.date} time={slot.time} onChange={onSlot} />
      </div>
      {delivery && (
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div>
            <label className="label" htmlFor="qa-cp">
              Código postal
            </label>
            <input id="qa-cp" className="input" inputMode="numeric" maxLength={5} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label className="label" htmlFor="qa-street">
              Dirección
            </label>
            <input id="qa-street" className="input" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="qa-city">
              Localidad
            </label>
            <input id="qa-city" className="input" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="qa-details">
              Indicaciones
            </label>
            <input id="qa-details" className="input" value={address.details} onChange={(e) => setAddress({ ...address, details: e.target.value })} />
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {payments.card && (
          <button
            type="button"
            onClick={() => setPaymentMethod("CARD")}
            className={clsx("rounded-2xl border p-4 text-left", paymentMethod === "CARD" || !canInStore ? "border-blush-600 bg-blush-50" : "border-sand-300 bg-white")}
          >
            <CreditCard className="size-5 text-blush-700" />
            <strong className="mt-2 block">Pagar ahora online</strong>
          </button>
        )}
        {canInStore && (
          <button
            type="button"
            onClick={() => setPaymentMethod("IN_STORE")}
            className={clsx("rounded-2xl border p-4 text-left", paymentMethod === "IN_STORE" ? "border-blush-600 bg-blush-50" : "border-sand-300 bg-white")}
          >
            <Store className="size-5 text-blush-700" />
            <strong className="mt-2 block">Pagar en tienda al recoger</strong>
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
          <Link href="/cancelaciones" target="_blank" className="font-medium text-blush-700 underline">
            política de cancelación
          </Link>
          .
        </span>
      </label>
      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || !slot.date || !slot.time || !terms || (delivery && (postalCode.length !== 5 || address.street.length < 5))}>
        {busy && <LoaderCircle className="size-4 animate-spin" />} Confirmar pedido
      </button>
    </form>
  );
}
