import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MapPin, Phone, Printer } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { PrintButton } from "@/components/admin/PrintButton";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { NEXT_STATUSES, ORDER_STATUS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { formatDateTime, formatLocalDate, formatPrice, telLink, whatsappLink } from "@/lib/format";
import { StatusPanel } from "./StatusPanel";
import { markOrderAsPaid, saveAdminNotes } from "../actions";

export const metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  const [order, settings] = await Promise.all([
    db.order.findUnique({
      where: { id },
      include: { items: true, history: { orderBy: { createdAt: "desc" } }, deliveryZone: true, quoteRequest: true, customer: true },
    }),
    getSettings(),
  ]);
  if (!order) notFound();
  const status = ORDER_STATUS[order.status];
  const firstName = order.customerName.split(" ")[0];
  const waText = `Hola ${firstName}, te escribimos de ${settings.business.name} sobre tu pedido ${order.number} para el ${formatLocalDate(order.scheduledDate)} a las ${order.scheduledTime}. `;

  return (
    <>
      <PageHeader
        title={`Pedido ${order.number}`}
        description={`Recibido el ${formatDateTime(order.createdAt, settings.business.timezone)}`}
        back="/admin/pedidos"
        actions={
          <>
            <Badge className={`${status.tone} px-3 py-1 text-sm`}>{status.label}</Badge>
            <PrintButton />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title={order.fulfillment === "PICKUP" ? "Recogida en tienda" : "Entrega a domicilio"}>
            <p className="font-display text-2xl text-cocoa-900 first-letter:uppercase">
              {formatLocalDate(order.scheduledDate)} · {order.scheduledTime}
            </p>
            {order.fulfillment === "DELIVERY" && (
              <p className="mt-2 flex gap-2 text-cocoa-700">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {order.address}, {order.postalCode} {order.city} {order.deliveryZone ? `(${order.deliveryZone.name})` : ""}
              </p>
            )}
            {order.notes && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Notas del cliente:</strong> {order.notes}
              </p>
            )}
          </Card>

          <Card title="Productos">
            <ul className="divide-y divide-sand-300/60">
              {order.items.map((item) => {
                const options = Array.isArray(item.options) ? (item.options as { group: string; choice: string }[]) : [];
                return (
                  <li key={item.id} className="py-3">
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-cocoa-900">
                        {item.quantity} × {item.name}
                        {item.isCustomCake && <Badge className="ml-2 bg-gold-200 text-gold-700">Personalizada</Badge>}
                      </p>
                      <p className="shrink-0 font-semibold">{formatPrice(item.lineTotalCents)}</p>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-cocoa-600">
                      {item.variantName && <li>Tamaño: {item.variantName}</li>}
                      {options.map((o) => (
                        <li key={`${o.group}-${o.choice}`}>
                          {o.group}: {o.choice}
                        </li>
                      ))}
                      {item.dedication && (
                        <li className="font-medium text-blush-800">Dedicatoria / texto: «{item.dedication}»</li>
                      )}
                    </ul>
                    {item.referencePhotoUrl && (
                      <a href={item.referencePhotoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.referencePhotoUrl} alt="Foto de referencia del cliente" className="h-32 rounded-xl border border-sand-300 object-cover" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-sand-300/60 pt-3 text-sm">
              <div className="flex justify-between">
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
                <div className="flex justify-between">
                  <dt>Envío</dt>
                  <dd>{formatPrice(order.deliveryFeeCents)}</dd>
                </div>
              )}
              {order.giftCardCents > 0 && (
                <div className="flex justify-between text-emerald-800">
                  <dt>Tarjeta regalo</dt>
                  <dd>−{formatPrice(order.giftCardCents)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd>{formatPrice(order.totalCents)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Historial">
            <ul className="space-y-2 text-sm">
              {order.history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="shrink-0 text-cocoa-500">{formatDateTime(h.createdAt, settings.business.timezone)}</span>
                  <span>
                    <strong>{ORDER_STATUS[h.status].label}</strong>
                    {h.note ? ` — ${h.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 print:hidden">
          <Card title="Cambiar estado">
            <StatusPanel orderId={order.id} next={NEXT_STATUSES[order.status]} canRefund={order.paymentStatus === "PAID" && !!order.stripePaymentIntentId} />
          </Card>

          <Card title="Cliente">
            <p className="font-semibold text-cocoa-900">{order.customerName}</p>
            {order.customer && (
              <p className="text-xs text-cocoa-500">
                {order.customer.ordersCount} pedidos entregados · {order.customer.loyaltyStamps} sellos
                {order.marketingConsent ? " · acepta novedades" : ""}
              </p>
            )}
            <div className="mt-3 grid gap-2">
              <a href={telLink(order.customerPhone)} className="btn-outline btn-sm justify-start">
                <Phone className="size-4" /> {order.customerPhone}
              </a>
              <a href={whatsappLink(order.customerPhone, waText)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm justify-start">
                <WhatsAppIcon className="size-4 text-[#1DA851]" /> Escribir por WhatsApp
              </a>
              <a href={`mailto:${order.customerEmail}?subject=${encodeURIComponent(`Tu pedido ${order.number}`)}`} className="btn-outline btn-sm justify-start">
                <Mail className="size-4" /> {order.customerEmail}
              </a>
            </div>
          </Card>

          <Card title="Pago">
            <p className="text-sm">
              {PAYMENT_METHOD_LABEL[order.paymentMethod]} · <strong>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</strong>
            </p>
            {order.paymentMethod === "IN_STORE" && order.paymentStatus !== "REFUNDED" && (
              <ActionForm action={markOrderAsPaid} className="mt-3">
                <input type="hidden" name="orderId" value={order.id} />
                <SubmitButton className="btn-outline btn-sm">{order.paymentStatus === "PAID" ? "Marcar como no pagado" : "Marcar como pagado"}</SubmitButton>
              </ActionForm>
            )}
            {order.quoteRequest && (
              <Link href={`/admin/presupuestos/${order.quoteRequest.id}`} className="mt-3 block text-sm text-blush-700 underline">
                Ver presupuesto {order.quoteRequest.number}
              </Link>
            )}
          </Card>

          <Card title="Notas internas">
            <ActionForm action={saveAdminNotes}>
              <input type="hidden" name="orderId" value={order.id} />
              <textarea name="adminNotes" rows={4} defaultValue={order.adminNotes ?? ""} className="input" placeholder="Solo las ve el equipo" />
              <SubmitButton className="btn-dark btn-sm mt-2">Guardar notas</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
      <p className="mt-6 hidden text-sm print:block">
        <Printer className="inline size-4" /> Pedido impreso desde el panel de {settings.business.name}
      </p>
    </>
  );
}
