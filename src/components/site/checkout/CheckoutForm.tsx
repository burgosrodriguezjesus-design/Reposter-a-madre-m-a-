"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CreditCard, Gift, LoaderCircle, Lock, MapPin, Store, Tag, Truck, User } from "lucide-react";
import clsx from "clsx";
import { useCart } from "@/lib/cart-store";
import { toItemInputs, type CheckoutPreview } from "@/lib/cart-types";
import { formatLocalDate, formatPrice } from "@/lib/format";
import { DateTimePicker } from "@/components/site/checkout/DateTimePicker";

type Config = {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryInfo: string;
  payments: { card: boolean; inStore: boolean };
  storeAddress: string;
  businessCity: string;
  zones: { name: string; postalCodes: string[] }[];
  cancellationSummary: string;
  allergenNotice: string;
  abandonedCartEnabled: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Step({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-7" aria-labelledby={`paso-${n}`}>
      <h2 id={`paso-${n}`} className="flex items-center gap-3 font-display text-2xl text-cocoa-900">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-blush-100 font-sans text-sm font-bold text-blush-700">
          {n}
        </span>
        {title}
        <Icon className="ml-auto size-5 text-gold-600" aria-hidden />
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CheckoutForm({ config }: { config: Config }) {
  const router = useRouter();
  const { lines } = useCart();
  const deliveryAllowed = config.deliveryEnabled && config.payments.card;

  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">(config.pickupEnabled ? "PICKUP" : "DELIVERY");
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState(config.businessCity);
  const [details, setDetails] = useState("");
  const [slot, setSlot] = useState({ date: "", time: "" });
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [selectedPayment, setPaymentMethod] = useState<"CARD" | "IN_STORE">(config.payments.card ? "CARD" : "IN_STORE");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [giftInput, setGiftInput] = useState("");
  const [giftCard, setGiftCard] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [rememberCart, setRememberCart] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [website, setWebsite] = useState("");
  const [rawPreview, setPreview] = useState<{ key: string; data: CheckoutPreview } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarKey, setCalendarKey] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const items = useMemo(() => toItemInputs(lines), [lines]);
  const validPostal = /^\d{5}$/.test(postalCode);

  // Recalcula precios reales en el servidor cada vez que cambia algo que afecta al importe
  const requestKey = JSON.stringify({ items, fulfillment, postalCode, coupon, giftCard });
  useEffect(() => {
    if (items.length === 0) return;
    if (fulfillment === "DELIVERY" && !validPostal) return;
    const controller = new AbortController();
    const key = requestKey;
    const t = setTimeout(() => {
      fetch("/api/checkout/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          items,
          fulfillment,
          postalCode: fulfillment === "DELIVERY" ? postalCode : undefined,
          couponCode: coupon || undefined,
          giftCardCode: giftCard || undefined,
        }),
      })
        .then((r) => r.json())
        .then((data: CheckoutPreview & { error?: string }) => {
          if (data.error) setError(data.error);
          else setPreview({ key, data });
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [items, fulfillment, postalCode, validPostal, coupon, giftCard, requestKey]);

  // Sin código postal válido no hay cálculo de entrega que mostrar
  const needsPreview = !(fulfillment === "DELIVERY" && !validPostal);
  const preview = needsPreview ? (rawPreview?.data ?? null) : null;
  const loadingPreview = needsPreview && rawPreview?.key !== requestKey;
  // Los pedidos a domicilio se pagan online
  const paymentMethod = fulfillment === "DELIVERY" && config.payments.card ? "CARD" : selectedPayment;

  // Recordatorio de carrito (solo con consentimiento expreso)
  useEffect(() => {
    if (!config.abandonedCartEnabled || !EMAIL_RE.test(customer.email)) return;
    const t = setTimeout(() => {
      if (rememberCart) {
        void fetch("/api/cart/remember", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: customer.email, name: customer.name || undefined, consent: true, lines }),
        });
      } else {
        void fetch(`/api/cart/remember?email=${encodeURIComponent(customer.email)}`, { method: "DELETE" });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [rememberCart, customer.email, customer.name, lines, config.abandonedCartEnabled]);

  const onSlotChange = useCallback((value: { date: string; time: string }) => setSlot(value), []);

  const leadHours = preview?.leadHours ?? Math.max(0, ...lines.map((l) => l.leadTimeHours));
  const total = preview?.totalCents ?? 0;
  const needsPayment = !preview || total > 0;

  if (lines.length === 0 && !submitted) {
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-sand-400 bg-white/60 p-10 text-center">
        <p className="font-display text-2xl text-cocoa-900">Tu carrito está vacío</p>
        <Link href="/productos" className="btn-primary mt-6">
          Ver productos
        </Link>
      </div>
    );
  }

  const missing: string[] = [];
  if (fulfillment === "DELIVERY" && (!validPostal || street.trim().length < 5)) missing.push("la dirección de entrega");
  if (!slot.date || !slot.time) missing.push("el día y la hora");
  if (customer.name.trim().length < 2 || !EMAIL_RE.test(customer.email) || customer.phone.replace(/\D/g, "").length < 9) {
    missing.push("tus datos de contacto");
  }
  if (!acceptTerms) missing.push("aceptar las condiciones");
  const blocked = !preview || !preview.ok || loadingPreview;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length || blocked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          fulfillment,
          postalCode: fulfillment === "DELIVERY" ? postalCode : undefined,
          couponCode: coupon || undefined,
          giftCardCode: giftCard || undefined,
          date: slot.date,
          time: slot.time,
          customer,
          address: fulfillment === "DELIVERY" ? { street, city, details: details || undefined } : undefined,
          notes: notes || undefined,
          paymentMethod,
          acceptTerms,
          marketingConsent,
          website,
        }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) {
        setError(data.error || "No se pudo completar el pedido");
        if (res.status === 409) setCalendarKey((k) => k + 1);
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      if (/^https?:\/\//.test(data.redirectUrl)) window.location.href = data.redirectUrl;
      else router.push(data.redirectUrl);
    } catch {
      setError("Error de conexión. Comprueba tu conexión e inténtalo de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]" noValidate>
      <div className="space-y-6">
        {/* 1. Entrega */}
        <Step n={1} title="Recogida o entrega" icon={Truck}>
          <div className="grid gap-3 sm:grid-cols-2">
            {config.pickupEnabled && (
              <button
                type="button"
                onClick={() => setFulfillment("PICKUP")}
                aria-pressed={fulfillment === "PICKUP"}
                className={clsx(
                  "rounded-2xl border p-4 text-left transition",
                  fulfillment === "PICKUP" ? "border-blush-600 bg-blush-50 ring-2 ring-blush-200" : "border-sand-300 bg-white hover:border-blush-300",
                )}
              >
                <Store className="size-5 text-blush-700" />
                <strong className="mt-2 block text-cocoa-900">Recogida en tienda</strong>
                <span className="text-sm text-cocoa-600">Gratis · {config.storeAddress}</span>
              </button>
            )}
            {config.deliveryEnabled && (
              <button
                type="button"
                onClick={() => deliveryAllowed && setFulfillment("DELIVERY")}
                disabled={!deliveryAllowed}
                aria-pressed={fulfillment === "DELIVERY"}
                className={clsx(
                  "rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                  fulfillment === "DELIVERY" ? "border-blush-600 bg-blush-50 ring-2 ring-blush-200" : "border-sand-300 bg-white hover:border-blush-300",
                )}
              >
                <Truck className="size-5 text-blush-700" />
                <strong className="mt-2 block text-cocoa-900">Entrega a domicilio</strong>
                <span className="text-sm text-cocoa-600">
                  {deliveryAllowed ? `En ${config.zones.map((z) => z.name).join(", ")}` : "Requiere pago online (no disponible ahora)"}
                </span>
              </button>
            )}
          </div>
          {fulfillment === "DELIVERY" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]">
              <div>
                <label htmlFor="cp" className="label">
                  Código postal
                </label>
                <input id="cp" inputMode="numeric" autoComplete="postal-code" maxLength={5} className="input" value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label htmlFor="street" className="label">
                  Dirección
                </label>
                <input id="street" autoComplete="street-address" className="input" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Calle, número, piso y puerta" />
              </div>
              <div>
                <label htmlFor="city" className="label">
                  Localidad
                </label>
                <input id="city" autoComplete="address-level2" className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label htmlFor="details" className="label">
                  Indicaciones <span className="font-normal text-cocoa-500">(opcional)</span>
                </label>
                <input id="details" className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Portero, timbre, referencias…" />
              </div>
              <p className="text-sm text-cocoa-500 sm:col-span-2">{config.deliveryInfo}</p>
              {preview?.zoneError && <p className="text-sm font-medium text-red-700 sm:col-span-2">{preview.zoneError}</p>}
              {preview?.zone && (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-800 sm:col-span-2">
                  <Check className="size-4" /> Repartimos en tu zona ({preview.zone.name})
                  {preview.zone.freeFromCents ? ` · envío gratis desde ${formatPrice(preview.zone.freeFromCents)}` : ""}
                </p>
              )}
            </div>
          )}
        </Step>

        {/* 2. Fecha y hora */}
        <Step n={2} title="Día y hora" icon={CalendarDays}>
          <p className="mb-4 text-sm text-cocoa-600">
            Tu pedido necesita al menos{" "}
            <strong>{leadHours >= 48 ? `${Math.round(leadHours / 24)} días` : `${leadHours} horas`}</strong> de antelación. Solo
            te mostramos los huecos libres de nuestro obrador.
          </p>
          <DateTimePicker leadHours={leadHours} date={slot.date} time={slot.time} onChange={onSlotChange} refreshKey={calendarKey} />
        </Step>

        {/* 3. Datos */}
        <Step n={3} title="Tus datos" icon={User}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="label">
                Nombre y apellidos
              </label>
              <input id="name" autoComplete="name" className="input" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input id="email" type="email" autoComplete="email" className="input" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value.trim() })} required />
              <p className="mt-1 text-xs text-cocoa-500">Te enviaremos la confirmación y el estado del pedido.</p>
            </div>
            <div>
              <label htmlFor="phone" className="label">
                Teléfono
              </label>
              <input id="phone" type="tel" autoComplete="tel" className="input" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} required />
              <p className="mt-1 text-xs text-cocoa-500">Solo para avisarte si hay cualquier imprevisto.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="label">
                Notas para el obrador <span className="font-normal text-cocoa-500">(opcional)</span>
              </label>
              <textarea id="notes" rows={3} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alergias, colores, cualquier detalle importante…" />
            </div>
            {/* Campo trampa anti-spam: no lo rellenes */}
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden name="website" />
          </div>
        </Step>

        {/* 4. Pago */}
        <Step n={4} title="Pago" icon={CreditCard}>
          {needsPayment ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {config.payments.card && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CARD")}
                  aria-pressed={paymentMethod === "CARD"}
                  className={clsx(
                    "rounded-2xl border p-4 text-left transition",
                    paymentMethod === "CARD" ? "border-blush-600 bg-blush-50 ring-2 ring-blush-200" : "border-sand-300 bg-white hover:border-blush-300",
                  )}
                >
                  <CreditCard className="size-5 text-blush-700" />
                  <strong className="mt-2 block text-cocoa-900">Pagar ahora online</strong>
                  <span className="text-sm text-cocoa-600">Tarjeta, Apple Pay o Google Pay (pago seguro con Stripe)</span>
                </button>
              )}
              {config.payments.inStore && (
                <button
                  type="button"
                  onClick={() => fulfillment === "PICKUP" && setPaymentMethod("IN_STORE")}
                  disabled={fulfillment !== "PICKUP"}
                  aria-pressed={paymentMethod === "IN_STORE"}
                  className={clsx(
                    "rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                    paymentMethod === "IN_STORE" ? "border-blush-600 bg-blush-50 ring-2 ring-blush-200" : "border-sand-300 bg-white hover:border-blush-300",
                  )}
                >
                  <Store className="size-5 text-blush-700" />
                  <strong className="mt-2 block text-cocoa-900">Reservar y pagar en tienda</strong>
                  <span className="text-sm text-cocoa-600">
                    {fulfillment === "PICKUP" ? "Pagas al recoger, en efectivo o con tarjeta" : "Solo para recogida en tienda"}
                  </span>
                </button>
              )}
              {!config.payments.card && !config.payments.inStore && (
                <p className="text-sm text-red-700">Ahora mismo no podemos cobrar pedidos online. Llámanos o escríbenos por WhatsApp.</p>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
              <Gift className="size-5" /> El importe queda cubierto con tu tarjeta regalo.
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="coupon" className="label">
                Código de descuento
              </label>
              <div className="flex gap-2">
                <input id="coupon" className="input uppercase" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="BIENVENIDA10" />
                {coupon ? (
                  <button type="button" className="btn-outline btn-sm" onClick={() => { setCoupon(""); setCouponInput(""); }}>
                    Quitar
                  </button>
                ) : (
                  <button type="button" className="btn-dark btn-sm" onClick={() => setCoupon(couponInput.trim())} disabled={!couponInput.trim()}>
                    Aplicar
                  </button>
                )}
              </div>
              {coupon && preview?.couponError && <p className="mt-1 text-sm text-red-700">{preview.couponError}</p>}
              {preview?.coupon && (
                <p className="mt-1 flex items-center gap-1 text-sm text-emerald-800">
                  <Tag className="size-3.5" /> {preview.coupon.code} aplicado
                </p>
              )}
            </div>
            <div>
              <label htmlFor="giftcard" className="label">
                Tarjeta regalo
              </label>
              <div className="flex gap-2">
                <input id="giftcard" className="input uppercase" value={giftInput} onChange={(e) => setGiftInput(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
                {giftCard ? (
                  <button type="button" className="btn-outline btn-sm" onClick={() => { setGiftCard(""); setGiftInput(""); }}>
                    Quitar
                  </button>
                ) : (
                  <button type="button" className="btn-dark btn-sm" onClick={() => setGiftCard(giftInput.trim())} disabled={!giftInput.trim()}>
                    Aplicar
                  </button>
                )}
              </div>
              {giftCard && preview?.giftCardError && <p className="mt-1 text-sm text-red-700">{preview.giftCardError}</p>}
              {preview?.giftCard && (
                <p className="mt-1 text-sm text-emerald-800">Saldo disponible: {formatPrice(preview.giftCard.balanceCents)}</p>
              )}
            </div>
          </div>
        </Step>
      </div>

      {/* Resumen */}
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="card p-6">
          <h2 className="font-display text-2xl text-cocoa-900">Resumen del pedido</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {(preview?.lines ?? lines.map((l) => ({ name: l.name, quantity: l.quantity, lineTotalCents: l.unitPriceCents * l.quantity }))).map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-cocoa-700">
                  {l.quantity} × {l.name}
                </span>
                <span className="shrink-0 font-medium">{formatPrice(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-sand-300/70 pt-4 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-cocoa-600">Subtotal</dt>
              <dd>{preview ? formatPrice(preview.subtotalCents) : "—"}</dd>
            </div>
            {fulfillment === "DELIVERY" && (
              <div className="flex justify-between">
                <dt className="text-cocoa-600">Envío</dt>
                <dd>{preview?.zone ? (preview.deliveryFeeCents ? formatPrice(preview.deliveryFeeCents) : "Gratis") : "—"}</dd>
              </div>
            )}
            {!!preview?.discountCents && (
              <div className="flex justify-between text-emerald-800">
                <dt>Descuento</dt>
                <dd>−{formatPrice(preview.discountCents)}</dd>
              </div>
            )}
            {!!preview?.giftCardCents && (
              <div className="flex justify-between text-emerald-800">
                <dt>Tarjeta regalo</dt>
                <dd>−{formatPrice(preview.giftCardCents)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-sand-300/70 pt-3 text-lg font-semibold text-cocoa-900">
              <dt>Total</dt>
              <dd className="flex items-center gap-2">
                {loadingPreview && <LoaderCircle className="size-4 animate-spin text-cocoa-400" />}
                {preview ? formatPrice(preview.totalCents) : "—"}
              </dd>
            </div>
          </dl>
          {preview && preview.errors.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-2xl bg-red-50 p-3 text-sm text-red-800">
              {preview.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {preview?.requiresReview && (
            <p className="mt-4 rounded-2xl bg-blush-50 p-3 text-sm text-blush-800">
              Tu pedido incluye personalizaciones: lo revisaremos y te confirmaremos por email.
            </p>
          )}
        </div>

        <div className="card space-y-4 p-6">
          <h3 className="font-semibold text-cocoa-900">Revisa antes de confirmar</h3>
          <ul className="space-y-2 text-sm text-cocoa-700">
            <li className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" />
              {fulfillment === "PICKUP" ? `Recogida en ${config.storeAddress}` : street ? `Entrega en ${street}, ${postalCode} ${city}` : "Dirección pendiente"}
            </li>
            <li className="flex gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-gold-600" />
              {slot.date && slot.time ? `${formatLocalDate(slot.date)} a las ${slot.time}` : "Día y hora pendientes"}
            </li>
            <li className="flex gap-2">
              <User className="mt-0.5 size-4 shrink-0 text-gold-600" />
              {customer.name ? `${customer.name} · ${customer.email} · ${customer.phone}` : "Datos de contacto pendientes"}
            </li>
            <li className="flex gap-2">
              <CreditCard className="mt-0.5 size-4 shrink-0 text-gold-600" />
              {!needsPayment ? "Tarjeta regalo" : paymentMethod === "CARD" ? "Pago online con tarjeta" : "Pago en tienda al recoger"}
            </li>
          </ul>

          <label className="flex items-start gap-3 text-sm text-cocoa-700">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" />
            <span>
              He leído y acepto las{" "}
              <Link href="/condiciones-de-compra" target="_blank" className="font-medium text-blush-700 underline">
                condiciones de compra
              </Link>
              , la{" "}
              <Link href="/cancelaciones" target="_blank" className="font-medium text-blush-700 underline">
                política de cancelación
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium text-blush-700 underline">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-cocoa-700">
            <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" />
            <span>Quiero recibir novedades, productos de temporada y ofertas por email (opcional, puedes darte de baja cuando quieras).</span>
          </label>
          {config.abandonedCartEnabled && (
            <label className="flex items-start gap-3 text-sm text-cocoa-700">
              <input type="checkbox" checked={rememberCart} onChange={(e) => setRememberCart(e.target.checked)} className="mt-0.5 size-4 accent-blush-600" />
              <span>Si no termino el pedido, enviadme un único recordatorio con mi carrito (opcional).</span>
            </label>
          )}
          <p className="text-xs text-cocoa-500">{config.cancellationSummary}</p>

          {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-800" role="alert">{error}</p>}
          {missing.length > 0 && <p className="text-sm text-cocoa-500">Falta: {missing.join(", ")}.</p>}

          <button type="submit" className="btn-primary w-full py-3.5 text-base" disabled={missing.length > 0 || blocked || submitting}>
            {submitting ? <LoaderCircle className="size-5 animate-spin" /> : <Lock className="size-4" />}
            {!needsPayment || paymentMethod === "IN_STORE" ? "Confirmar pedido" : `Pagar ${preview ? formatPrice(total) : ""} y confirmar`}
          </button>
          <p className="text-center text-xs text-cocoa-500">No guardamos los datos de tu tarjeta: el pago lo procesa Stripe de forma segura.</p>
        </div>
      </aside>
    </form>
  );
}
