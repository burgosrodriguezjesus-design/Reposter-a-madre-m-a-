import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { paymentOptions } from "@/lib/checkout";
import { QUOTE_STATUS } from "@/lib/order-status";
import { formatLocalDate, formatPrice } from "@/lib/format";
import { AcceptQuoteForm } from "@/components/site/AcceptQuoteForm";

export const metadata: Metadata = { title: "Tu presupuesto", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function QuotePage({ params, searchParams }: PageProps<"/presupuesto/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.t === "string" ? query.t : "";
  const quote = await db.quoteRequest.findUnique({ where: { id }, include: { order: true } });
  if (!quote || !token || quote.accessToken !== token) notFound();
  const settings = await getSettings();
  const spec = quote.spec as { summary?: { label: string; value: string }[] };
  const status = QUOTE_STATUS[quote.status];

  return (
    <div className="container-page max-w-4xl py-10 sm:py-14">
      <p className="eyebrow">Solicitud {quote.number}</p>
      <h1 className="mt-2 font-display text-4xl text-cocoa-900">Tu tarta personalizada</h1>
      <p className="mt-3">
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </p>
      {query.cancelado === "1" && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-amber-900">El pago no se completó. Puedes intentarlo de nuevo cuando quieras.</p>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr]">
        <section className="card p-6">
          <h2 className="font-display text-xl text-cocoa-900">Tu diseño</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {(spec.summary ?? []).map((s) => (
              <div key={s.label} className="flex justify-between gap-4">
                <dt className="text-cocoa-500">{s.label}</dt>
                <dd className="text-right text-cocoa-800">{s.value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-cocoa-500">Fecha deseada</dt>
              <dd className="text-right text-cocoa-800 first-letter:uppercase">{formatLocalDate(quote.desiredDate)}</dd>
            </div>
          </dl>
          {quote.notes && <p className="mt-4 rounded-2xl bg-cream-100 p-3 text-sm text-cocoa-700">{quote.notes}</p>}
          {quote.referencePhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={quote.referencePhotoUrl} alt="Foto de inspiración enviada" className="mt-4 max-h-56 rounded-2xl object-cover" />
          )}
        </section>

        <section className="card p-6">
          {quote.status === "NEW" && (
            <>
              <h2 className="font-display text-xl text-cocoa-900">Estamos estudiando tu idea</h2>
              <p className="mt-3 text-cocoa-600">
                Te enviaremos el precio final por email en menos de 24 h laborables. Precio orientativo calculado:{" "}
                <strong>{quote.estimatedCents ? formatPrice(quote.estimatedCents) : "—"}</strong>.
              </p>
            </>
          )}
          {quote.status === "QUOTED" && (
            <>
              <h2 className="font-display text-xl text-cocoa-900">Presupuesto</h2>
              <p className="mt-2 font-display text-5xl text-cocoa-900">{formatPrice(quote.quotedCents ?? 0)}</p>
              {quote.adminMessage && <p className="mt-4 rounded-2xl bg-blush-50 p-4 text-cocoa-700">{quote.adminMessage}</p>}
            </>
          )}
          {quote.status === "ACCEPTED" && quote.order && (
            <>
              <h2 className="font-display text-xl text-cocoa-900">¡Confirmado!</h2>
              <p className="mt-3 text-cocoa-600">Ya tenemos tu pedido en la agenda.</p>
              <Link href={`/pedido/${quote.order.number}?t=${quote.order.accessToken}`} className="btn-primary mt-4">
                Ver mi pedido
              </Link>
            </>
          )}
          {(quote.status === "REJECTED" || quote.status === "EXPIRED") && (
            <>
              <h2 className="font-display text-xl text-cocoa-900">No podemos realizar este encargo</h2>
              {quote.adminMessage && <p className="mt-3 text-cocoa-700">{quote.adminMessage}</p>}
              <Link href="/personalizar-tarta" className="btn-outline mt-4">
                Diseñar otra tarta
              </Link>
            </>
          )}
        </section>
      </div>

      {quote.status === "QUOTED" && (
        <div className="mt-8">
          <AcceptQuoteForm
            quoteId={quote.id}
            token={token}
            fulfillment={quote.fulfillment}
            payments={paymentOptions(settings)}
            defaultCity={settings.business.city}
          />
        </div>
      )}
    </div>
  );
}
