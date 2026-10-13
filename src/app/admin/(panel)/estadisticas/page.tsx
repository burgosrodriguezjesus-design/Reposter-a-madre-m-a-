import { Card, PageHeader, Stat, Tabs } from "@/components/admin/ui";
import { BarChart } from "@/components/admin/BarChart";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Estadísticas" };

const SOLD = ["ACCEPTED", "IN_PREPARATION", "READY", "DELIVERED"] as const;
const PERIODS = { "30": 30, "90": 90, "365": 365 } as const;
/** Hora actual (fuera del cuerpo del componente para mantenerlo puro). */
const now = () => Date.now();

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default async function StatsPage({ searchParams }: PageProps<"/admin/estadisticas">) {
  await requirePermission("stats.view");
  const { periodo } = await searchParams;
  const key = (typeof periodo === "string" && periodo in PERIODS ? periodo : "30") as keyof typeof PERIODS;
  const days = PERIODS[key];
  const since = new Date(now() - days * 86_400_000);

  const orders = await db.order.findMany({
    where: { status: { in: [...SOLD] }, createdAt: { gte: since } },
    select: { createdAt: true, totalCents: true, giftCardCents: true, discountCents: true, fulfillment: true, paymentMethod: true, couponCode: true, customerEmailHash: true },
  });
  const [topItems, cancelled, quotes] = await Promise.all([
    db.orderItem.groupBy({
      by: ["name"],
      where: { order: { status: { in: [...SOLD] }, createdAt: { gte: since } } },
      _sum: { quantity: true, lineTotalCents: true },
      orderBy: { _sum: { lineTotalCents: "desc" } },
      take: 10,
    }),
    db.order.count({ where: { status: { in: ["REJECTED", "CANCELLED"] }, createdAt: { gte: since } } }),
    db.quoteRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);

  const amount = (o: (typeof orders)[number]) => o.totalCents + o.giftCardCents;
  const revenue = orders.reduce((s, o) => s + amount(o), 0);
  const avg = orders.length ? Math.round(revenue / orders.length) : 0;
  const customers = new Set(orders.map((o) => o.customerEmailHash)).size;
  const discounts = orders.reduce((s, o) => s + o.discountCents, 0);

  // Serie temporal: por día (30), por semana (90) o por mes (365)
  const buckets: { key: string; label: string; value: number; orders: number }[] = [];
  const keyOf = (d: Date) => {
    if (days === 365) return `${d.getFullYear()}-${d.getMonth()}`;
    if (days === 90) return String(Math.floor((d.getTime() - since.getTime()) / (7 * 86_400_000)));
    return d.toISOString().slice(0, 10);
  };
  if (days === 365) {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, value: 0, orders: 0 });
    }
  } else if (days === 90) {
    for (let w = 0; w < 13; w++) {
      const start = new Date(since.getTime() + w * 7 * 86_400_000);
      buckets.push({ key: String(w), label: `${start.getDate()} ${MONTHS[start.getMonth()]}`, value: 0, orders: 0 });
    }
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now() - i * 86_400_000);
      buckets.push({ key: d.toISOString().slice(0, 10), label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, value: 0, orders: 0 });
    }
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const o of orders) {
    const i = index.get(keyOf(o.createdAt));
    if (i != null) {
      buckets[i].value += amount(o);
      buckets[i].orders++;
    }
  }

  const byPayment = Object.entries(
    orders.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.paymentMethod]: (acc[o.paymentMethod] ?? 0) + 1 }), {}),
  );
  const delivery = orders.filter((o) => o.fulfillment === "DELIVERY").length;
  const quoteCount = (s: string) => quotes.find((q) => q.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader title="Estadísticas de ventas" description="Pedidos aceptados, en preparación, listos o entregados (por fecha de pedido)." />
      <Tabs
        active={`/admin/estadisticas?periodo=${key}`}
        items={[
          { href: "/admin/estadisticas?periodo=30", label: "Últimos 30 días" },
          { href: "/admin/estadisticas?periodo=90", label: "Últimos 3 meses" },
          { href: "/admin/estadisticas?periodo=365", label: "Últimos 12 meses" },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas" value={formatPrice(revenue)} hint={`${orders.length} pedidos`} />
        <Stat label="Ticket medio" value={formatPrice(avg)} />
        <Stat label="Clientes distintos" value={customers} />
        <Stat label="Descuentos aplicados" value={formatPrice(discounts)} hint={`${cancelled} pedidos cancelados/rechazados`} />
      </div>

      <Card title="Ventas en el periodo" className="mt-6">
        <BarChart data={buckets} title={`Ventas ${days === 30 ? "por día" : days === 90 ? "por semana" : "por mes"}`} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Productos más vendidos">
          {topItems.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-cocoa-500">
                <tr>
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 text-right font-medium">Uds.</th>
                  <th className="pb-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((t) => (
                  <tr key={t.name} className="border-t border-sand-300/50">
                    <td className="py-2 pr-2">{t.name}</td>
                    <td className="py-2 text-right">{t._sum.quantity}</td>
                    <td className="py-2 text-right font-medium">{formatPrice(t._sum.lineTotalCents ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-cocoa-500">Aún no hay ventas en este periodo.</p>
          )}
        </Card>
        <Card title="Cómo compran">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-cocoa-600">Recogida en tienda</dt>
              <dd className="font-semibold">{orders.length - delivery}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-cocoa-600">Entrega a domicilio</dt>
              <dd className="font-semibold">{delivery}</dd>
            </div>
            {byPayment.map(([method, n]) => (
              <div key={method} className="flex justify-between">
                <dt className="text-cocoa-600">{PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL]}</dt>
                <dd className="font-semibold">{n}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-sand-300/60 pt-2">
              <dt className="text-cocoa-600">Presupuestos recibidos / aceptados</dt>
              <dd className="font-semibold">
                {quotes.reduce((s, q) => s + q._count._all, 0)} / {quoteCount("ACCEPTED")}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
