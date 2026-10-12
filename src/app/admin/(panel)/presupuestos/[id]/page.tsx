import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons";
import { Badge, Card, Field, PageHeader } from "@/components/admin/ui";
import { ActionForm, MoneyInput } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { QUOTE_STATUS } from "@/lib/order-status";
import { formatDateTime, formatLocalDate, formatPrice, telLink, whatsappLink } from "@/lib/format";
import { quoteUrl } from "@/lib/emails";
import { answerQuote } from "../actions";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { signedMediaUrl } from "@/lib/storage";

export const metadata = { title: "Presupuesto" };

export default async function QuoteDetailPage({ params }: PageProps<"/admin/presupuestos/[id]">) {
  const admin = await requirePermission("quotes.manage");
  const { id } = await params;
  const quote = await db.quoteRequest.findUnique({ where: { id }, include: { order: true } });
  if (!quote) notFound();
  await auditAdmin(admin, { action: "quote.view", entity: "QuoteRequest", entityId: quote.id });
  const photo = signedMediaUrl(quote.referencePhotoUrl);
  const spec = quote.spec as { summary?: { label: string; value: string }[]; requiresQuote?: boolean };
  const open = quote.status === "NEW" || quote.status === "QUOTED";

  return (
    <>
      <PageHeader
        title={`Solicitud ${quote.number}`}
        description={`Recibida el ${formatDateTime(quote.createdAt)}`}
        back="/admin/presupuestos"
        actions={<Badge className={`${QUOTE_STATUS[quote.status].tone} px-3 py-1 text-sm`}>{QUOTE_STATUS[quote.status].label}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Diseño solicitado">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {(spec.summary ?? []).map((s) => (
                <div key={s.label}>
                  <dt className="text-cocoa-500">{s.label}</dt>
                  <dd className="font-medium text-cocoa-900">{s.value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-cocoa-500">Fecha deseada</dt>
                <dd className="font-medium text-cocoa-900 first-letter:uppercase">{formatLocalDate(quote.desiredDate)}</dd>
              </div>
              <div>
                <dt className="text-cocoa-500">Entrega</dt>
                <dd className="font-medium text-cocoa-900">{quote.fulfillment === "PICKUP" ? "Recogida en tienda" : "A domicilio"}</dd>
              </div>
            </dl>
            {quote.notes && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{quote.notes}</p>}
            {photo && (
              <a href={photo} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Foto de inspiración" className="max-h-72 rounded-xl border border-sand-300 object-cover" />
              </a>
            )}
            <p className="mt-4 text-sm text-cocoa-600">
              Precio orientativo según tus tarifas: <strong>{formatPrice(quote.estimatedCents ?? 0)}</strong>
              {spec.requiresQuote ? " (sin incluir las decoraciones que requieren presupuesto)" : ""}
            </p>
          </Card>

          {open && (
            <Card title="Responder">
              <ActionForm action={answerQuote} className="space-y-4">
                <input type="hidden" name="id" value={quote.id} />
                <Field label="Precio final">
                  <MoneyInput name="quotedCents" defaultValue={quote.quotedCents ?? quote.estimatedCents} />
                </Field>
                <Field label="Mensaje para el cliente" hint="Explica qué incluye, plazos, prueba de sabores, etc.">
                  <textarea name="message" rows={4} defaultValue={quote.adminMessage ?? ""} className="input" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button name="decision" value="quote" className="btn-primary">
                    {quote.status === "QUOTED" ? "Actualizar y reenviar presupuesto" : "Enviar presupuesto"}
                  </button>
                  <button name="decision" value="reject" className="btn-outline text-red-700">
                    Rechazar
                  </button>
                  <button name="decision" value="expire" className="btn-ghost">
                    Marcar caducado
                  </button>
                </div>
              </ActionForm>
            </Card>
          )}
          {quote.order && (
            <Card title="Pedido generado">
              <Link href={`/admin/pedidos/${quote.order.id}`} className="text-blush-700 underline">
                Pedido {quote.order.number}
              </Link>
            </Card>
          )}
        </div>
        <Card title="Cliente">
          <p className="font-semibold">{quote.customerName}</p>
          <div className="mt-3 grid gap-2">
            <a href={telLink(quote.customerPhone)} className="btn-outline btn-sm justify-start">
              <Phone className="size-4" /> {quote.customerPhone}
            </a>
            <a
              href={whatsappLink(quote.customerPhone, `Hola ${quote.customerName.split(" ")[0]}, te escribimos sobre tu solicitud de tarta ${quote.number}. `)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline btn-sm justify-start"
            >
              <WhatsAppIcon className="size-4 text-[#1DA851]" /> WhatsApp
            </a>
            <a href={`mailto:${quote.customerEmail}`} className="btn-outline btn-sm justify-start">
              <Mail className="size-4" /> {quote.customerEmail}
            </a>
          </div>
          <p className="mt-4 text-xs break-all text-cocoa-500">
            Enlace del cliente: <a href={quoteUrl(quote)} className="underline">{quoteUrl(quote)}</a>
          </p>
        </Card>
      </div>
    </>
  );
}
