import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Check, CircleCheck, Clock, LoaderCircle, MapPin, Star, XCircle } from "lucide-react";
import clsx from "clsx";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { accessTokenFor } from "@/lib/access-token";
import { log } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import { getStripe, paymentFromSession } from "@/lib/stripe";
import { markOrderPaid } from "@/lib/order-events";
import { ORDER_STATUS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_FLOW } from "@/lib/order-status";
import { formatDateTime, formatLocalDate, formatPrice, whatsappLink } from "@/lib/format";
import { fullAddress, mapsDirectionsUrl } from "@/lib/structured-data";
import { ClearCart } from "@/components/site/ClearCart";
import { WhatsAppIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Estado de tu pedido", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function calendarLink(title: string, date: string, time: string, location: string, details: string) {
  const start = `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
  const [h, m] = time.split(":").map(Number);
  const endTotal = h * 60 + m + 30;
  const end = `${date.replace(/-/g, "")}T${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}${String(endTotal % 60).padStart(2, "0")}00`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${start}/${end}`, ctz: "Europe/Madrid", location, details });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export default async function OrderPage({ params, searchParams }: PageProps<"/pedido/[number]">) {
  const [{ number }, query] = await Promise.all([params, searchParams]);
  const token = await accessTokenFor("pedido", number, query.t);
  let order = await db.order.findUnique({
    where: { number },
    include: { items: true, history: { orderBy: { createdAt: "asc" } }, customer: true },
  });
  // Sin el token secreto no se muestra nada (protege los datos personales)
  if (!order || !token || !safeEqual(order.accessToken, token)) notFound();

  // Al volver de Stripe comprobamos el pago (por si el webhook aún no ha llegado)
  if (order.status === "PENDING_PAYMENT" && order.stripeSessionId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        if (session.payment_status === "paid") {
          await markOrderPaid(order.id, paymentFromSession(session));
          order = (await db.order.findUnique({
            where: { id: order.id },
            include: { items: true, history: { orderBy: { createdAt: "asc" } }, customer: true },
          }))!;
        }
      } catch (error) {
        log.warn("order.payment_check_failed", { error });
      }
    }
  }

  const settings = await getSettings();
  const b = settings.business;
  const isNew = query.nuevo === "1" || query.pago === "ok";
  const waitingPayment = order.status === "PENDING_PAYMENT";
  const closed = order.status === "REJECTED" || order.status === "CANCELLED";
  const currentIndex = STATUS_FLOW.indexOf(order.status);
  const statusInfo = ORDER_STATUS[order.status];
  const location = order.fulfillment === "PICKUP" ? fullAddress(b) : `${order.address ?? ""} ${order.postalCode ?? ""}`;

  return (
    <div className="container-page max-w-4xl py-10 sm:py-14">
      {isNew && <ClearCart refreshWhilePending={waitingPayment} />}

      <div className="text-center">
        {waitingPayment ? (
          <LoaderCircle className="mx-auto size-14 animate-spin text-blush-500" />
        ) : closed ? (
          <XCircle className="mx-auto size-14 text-stone-500" />
        ) : (
          <CircleCheck className="mx-auto size-14 text-emerald-600" strokeWidth={1.6} />
        )}
        <h1 className="mt-4 font-display text-4xl text-cocoa-900 sm:text-5xl">
          {waitingPayment ? "Confirmando tu pago…" : isNew ? `¡Gracias, ${order.customerName.split(" ")[0]}!` : `Pedido ${order.number}`}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-cocoa-600">
          {waitingPayment
            ? "Estamos esperando la confirmación de Stripe. Esta página se actualizará sola en unos segundos."
            : statusInfo.customerText}
        </p>
        {isNew && !waitingPayment && (
          <p className="mt-2 text-sm text-cocoa-500">
            Número de pedido <strong className="text-cocoa-800">{order.number}</strong> · Te hemos enviado un email a {order.customerEmail}
          </p>
        )}
      </div>

      {/* Línea de estado */}
      {!closed && !waitingPayment && (
        <ol className="mx-auto mt-10 grid max-w-3xl grid-cols-5 gap-2" aria-label="Estado del pedido">
          {STATUS_FLOW.map((status, i) => {
            const done = i <= currentIndex;
            return (
              <li key={status} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={clsx(
                    "flex size-10 items-center justify-center rounded-full border-2 text-sm font-bold",
                    done ? "border-blush-600 bg-blush-600 text-white" : "border-sand-300 bg-white text-cocoa-500",
                    i === currentIndex && "ring-4 ring-blush-200",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={clsx("text-xs sm:text-sm", done ? "font-semibold text-cocoa-900" : "text-cocoa-500")}>
                  {ORDER_STATUS[status].label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {order.status === "REJECTED" && order.rejectionReason && (
        <p className="mx-auto mt-6 max-w-xl rounded-2xl bg-cream-200 p-4 text-center text-cocoa-700">{order.rejectionReason}</p>
      )}

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-display text-xl text-cocoa-900">{order.fulfillment === "PICKUP" ? "Recogida" : "Entrega"}</h2>
          <p className="mt-3 flex gap-2 text-cocoa-700">
            <Clock className="mt-0.5 size-4 shrink-0 text-gold-600" />
            <span className="first-letter:uppercase">
              {formatLocalDate(order.scheduledDate)} · {order.scheduledTime}
            </span>
          </p>
          <p className="mt-2 flex gap-2 text-cocoa-700">
            <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" />
            {location}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={calendarLink(`Recoger pedido ${order.number} · ${b.name}`, order.scheduledDate, order.scheduledTime, location, `Pedido ${order.number}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline btn-sm"
            >
              <CalendarPlus className="size-4" /> Añadir al calendario
            </a>
            {order.fulfillment === "PICKUP" && (
              <a href={mapsDirectionsUrl(b)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
                <MapPin className="size-4" /> Cómo llegar
              </a>
            )}
            {b.whatsapp && (
              <a href={whatsappLink(b.whatsapp, `Hola, tengo una consulta sobre mi pedido ${order.number}`)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
                <WhatsAppIcon className="size-4" /> WhatsApp
              </a>
            )}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-xl text-cocoa-900">Pago</h2>
          <p className="mt-3 text-cocoa-700">
            {PAYMENT_METHOD_LABEL[order.paymentMethod]} · <strong>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</strong>
          </p>
          {order.paymentMethod === "IN_STORE" && order.paymentStatus === "UNPAID" && (
            <p className="mt-2 text-sm text-cocoa-600">Pagarás {formatPrice(order.totalCents)} al recoger el pedido.</p>
          )}
          {settings.marketing.loyaltyEnabled && order.customer && (
            <p className="mt-4 rounded-2xl bg-gold-200/50 p-3 text-sm text-cocoa-700">
              🎁 Tarjeta de sellos: llevas <strong>{order.customer.loyaltyStamps}</strong> de {settings.marketing.loyaltyStampsForReward}. Al
              completarla te regalamos {formatPrice(settings.marketing.loyaltyRewardCents)}.
            </p>
          )}
        </section>
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-display text-xl text-cocoa-900">Tu pedido</h2>
        <ul className="mt-4 divide-y divide-sand-300/60">
          {order.items.map((item) => {
            const options = Array.isArray(item.options) ? (item.options as { group: string; choice: string }[]) : [];
            return (
              <li key={item.id} className="flex justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-cocoa-900">
                    {item.quantity} × {item.name}
                  </p>
                  <p className="text-sm text-cocoa-500">
                    {[item.variantName, ...options.map((o) => `${o.group}: ${o.choice}`), item.dedication ? `«${item.dedication}»` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 font-semibold">{formatPrice(item.lineTotalCents)}</p>
              </li>
            );
          })}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-sand-300/70 pt-4 text-[15px]">
          <div className="flex justify-between text-cocoa-600">
            <dt>Subtotal</dt>
            <dd>{formatPrice(order.subtotalCents)}</dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-emerald-800">
              <dt>Descuento {order.couponCode}</dt>
              <dd>−{formatPrice(order.discountCents)}</dd>
            </div>
          )}
          {order.fulfillment === "DELIVERY" && (
            <div className="flex justify-between text-cocoa-600">
              <dt>Envío</dt>
              <dd>{order.deliveryFeeCents ? formatPrice(order.deliveryFeeCents) : "Gratis"}</dd>
            </div>
          )}
          {order.giftCardCents > 0 && (
            <div className="flex justify-between text-emerald-800">
              <dt>Tarjeta regalo</dt>
              <dd>−{formatPrice(order.giftCardCents)}</dd>
            </div>
          )}
          <div className="flex justify-between pt-2 text-lg font-semibold text-cocoa-900">
            <dt>Total</dt>
            <dd>{formatPrice(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-3xl bg-cream-50 p-6 text-sm text-cocoa-600">
        <h2 className="mb-2 font-semibold text-cocoa-800">Historial</h2>
        <ul className="space-y-1">
          {order.history.map((h) => (
            <li key={h.id}>
              {formatDateTime(h.createdAt, b.timezone)} · {ORDER_STATUS[h.status].label}
              {h.note ? ` — ${h.note}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-4">{settings.ordering.cancellationSummary}</p>
      </section>

      {isNew && !waitingPayment && settings.marketing.remindersEnabled && (
        <div className="mt-8 rounded-3xl bg-blush-50 p-6 text-center">
          <p className="font-display text-xl text-cocoa-900">¿Quieres que te recordemos esta fecha el año que viene?</p>
          <Link href="/recordatorios" className="btn-outline btn-sm mt-4">
            Crear recordatorio
          </Link>
        </div>
      )}

      {order.status === "DELIVERED" && (
        <div className="mt-8 text-center">
          <Link href={`/opiniones?pedido=${order.number}`} className="btn-primary">
            <Star className="size-4" /> ¿Qué te pareció? Déjanos tu opinión
          </Link>
        </div>
      )}
    </div>
  );
}
