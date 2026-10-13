import Link from "next/link";
import { CheckCircle2, CircleAlert, MessageSquareQuote, Star } from "lucide-react";
import { Card, Empty, PageHeader, Stat } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/admin/forms";
import { OrderRow } from "@/components/admin/OrderRow";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { hasDemoContent } from "@/lib/catalog";
import { addDays, localNow } from "@/lib/availability";
import { formatPrice } from "@/lib/format";
import { setupChecklist } from "@/lib/setup-status";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";

const SOLD = ["ACCEPTED", "IN_PREPARATION", "READY", "DELIVERED"] as const;

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const admin = await requirePermission("orders.view");
  const settings = await getSettings();
  const today = localNow(settings.business.timezone).date;
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00`);

  const [pending, upcoming, todayCount, monthAgg, newQuotes, pendingReviews, demo] = await Promise.all([
    db.order.findMany({ where: { status: "PENDING" }, orderBy: { scheduledDate: "asc" }, take: 8, include: { items: { select: { name: true, quantity: true } } } }),
    db.order.findMany({
      where: { status: { in: ["ACCEPTED", "IN_PREPARATION", "READY"] }, scheduledDate: { gte: today, lte: addDays(today, 7) } },
      orderBy: [{ scheduledDate: "asc" }, { scheduledTime: "asc" }],
      take: 15,
      include: { items: { select: { name: true, quantity: true } } },
    }),
    db.order.count({ where: { scheduledDate: today, status: { in: ["PENDING", ...SOLD] } } }),
    db.order.aggregate({
      where: { status: { in: [...SOLD] }, createdAt: { gte: monthStart } },
      _sum: { totalCents: true, giftCardCents: true },
      _count: { _all: true },
    }),
    db.quoteRequest.count({ where: { status: "NEW" } }),
    db.review.count({ where: { status: "PENDING" } }),
    hasDemoContent(),
  ]);

  const monthRevenue = (monthAgg._sum.totalCents ?? 0) + (monthAgg._sum.giftCardCents ?? 0);
  const avg = monthAgg._count._all ? Math.round(monthRevenue / monthAgg._count._all) : 0;
  const checklist = setupChecklist(settings, demo);
  const pendingSetup = checklist.filter((c) => !c.ok);
  const summary = (items: { name: string; quantity: number }[]) => items.map((i) => `${i.quantity}× ${i.name}`).join(", ");

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader title={`Hola 👋`} description="Resumen de tu obrador. Esta página se actualiza sola cada minuto." />
      {(await searchParams)["sin-permiso"] === "1" && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tu usuario no tiene permiso para esa sección. Si lo necesitas, pídeselo al propietario.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Por aceptar" value={pending.length} hint="pedidos pendientes" href="/admin/pedidos" />
        <Stat label="Para hoy" value={todayCount} hint="recogidas y entregas" href="/admin/pedidos?vista=hoy" />
        {can(admin.role, "stats.view") && (
          <>
            <Stat label="Ventas del mes" value={formatPrice(monthRevenue)} hint={`${monthAgg._count._all} pedidos`} href="/admin/estadisticas" />
            <Stat label="Ticket medio" value={formatPrice(avg)} hint="este mes" />
          </>
        )}
      </div>

      {(newQuotes > 0 || pendingReviews > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {newQuotes > 0 && (
            <Link href="/admin/presupuestos" className="btn-dark btn-sm">
              <MessageSquareQuote className="size-4" /> {newQuotes} presupuesto{newQuotes > 1 ? "s" : ""} por responder
            </Link>
          )}
          {pendingReviews > 0 && (
            <Link href="/admin/opiniones" className="btn-outline btn-sm">
              <Star className="size-4" /> {pendingReviews} opinión{pendingReviews > 1 ? "es" : ""} por revisar
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Pendientes de aceptar" actions={<Link href="/admin/pedidos" className="text-sm text-blush-700">Ver todos</Link>}>
          {pending.length ? (
            <div className="space-y-2">
              {pending.map((o) => (
                <OrderRow key={o.id} order={o} itemsSummary={summary(o.items)} />
              ))}
            </div>
          ) : (
            <Empty>No hay pedidos pendientes. ¡Todo al día! ✨</Empty>
          )}
        </Card>
        <Card title="Próximos 7 días" actions={<Link href="/admin/calendario" className="text-sm text-blush-700">Calendario</Link>}>
          {upcoming.length ? (
            <div className="space-y-2">
              {upcoming.map((o) => (
                <OrderRow key={o.id} order={o} itemsSummary={summary(o.items)} />
              ))}
            </div>
          ) : (
            <Empty>No hay pedidos confirmados para los próximos días.</Empty>
          )}
        </Card>
      </div>

      {pendingSetup.length > 0 && (
        <Card title={`Puesta en marcha (${checklist.length - pendingSetup.length}/${checklist.length})`} className="mt-6">
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex gap-3 rounded-xl bg-cream-50 p-3 text-sm">
                {item.ok ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" /> : <CircleAlert className="size-5 shrink-0 text-amber-600" />}
                <span>
                  <strong className="block text-cocoa-900">
                    {item.href && !item.ok ? (
                      <Link href={item.href} className="underline">
                        {item.label}
                      </Link>
                    ) : (
                      item.label
                    )}
                  </strong>
                  {!item.ok && <span className="text-cocoa-600">{item.help}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cocoa-500">Las variables de entorno se configuran en tu proveedor de hosting (ver README).</p>
        </Card>
      )}
    </>
  );
}
