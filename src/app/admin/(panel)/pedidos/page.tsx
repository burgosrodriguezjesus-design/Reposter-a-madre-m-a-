import type { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { Empty, PageHeader, Tabs } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/admin/forms";
import { OrderRow } from "@/components/admin/OrderRow";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { localNow } from "@/lib/availability";
import { matchesText, parsePiiQuery, SCAN_LIMIT } from "@/lib/pii-search";
import { auditAdmin, requirePermission } from "@/lib/auth";

export const metadata = { title: "Pedidos" };

const VIEWS = ["pendientes", "hoy", "proximos", "listos", "todos"] as const;
type View = (typeof VIEWS)[number];

export default async function OrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  const admin = await requirePermission("orders.view");
  const params = await searchParams;
  const view: View = VIEWS.includes(params.vista as View) ? (params.vista as View) : "pendientes";
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const day = typeof params.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) ? params.fecha : "";
  const search = parsePiiQuery(q);
  // Las búsquedas por datos personales quedan registradas (el listado normal se refresca solo y no)
  if (q) await auditAdmin(admin, { action: "orders.search", entity: "Order", details: { kind: search.kind } });
  const settings = await getSettings();
  const today = localNow(settings.business.timezone).date;

  const base: Record<View, Prisma.OrderWhereInput> = {
    pendientes: { status: "PENDING" },
    hoy: { scheduledDate: today, status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT"] } },
    proximos: { scheduledDate: { gte: today }, status: { in: ["ACCEPTED", "IN_PREPARATION"] } },
    listos: { status: "READY" },
    todos: {},
  };
  const where: Prisma.OrderWhereInput = {
    ...base[view],
    ...(day ? { scheduledDate: day, status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT"] } } : {}),
    ...(search.kind === "email" ? { customerEmailHash: search.hash } : {}),
    ...(search.kind === "phone" ? { customerPhoneHash: search.hash } : {}),
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput[] =
    view === "todos" || search.kind === "text" ? [{ createdAt: "desc" }] : [{ scheduledDate: "asc" }, { scheduledTime: "asc" }];

  // Nombre o número: los nombres están cifrados, así que se filtran en memoria los más recientes.
  const take = search.kind === "text" ? SCAN_LIMIT : 100;
  const [found, counts] = await Promise.all([
    db.order.findMany({ where, orderBy, take, include: { items: { select: { name: true, quantity: true } } } }),
    Promise.all(VIEWS.map((v) => (v === "todos" ? Promise.resolve(0) : db.order.count({ where: base[v] })))),
  ]);
  const orders =
    search.kind === "text" ? found.filter((o) => matchesText(search.needle, o.number, o.customerName)).slice(0, 100) : found;
  const labels: Record<View, string> = { pendientes: "Por aceptar", hoy: "Hoy", proximos: "Próximos", listos: "Listos", todos: "Todos" };

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader title="Pedidos" description="Acepta, prepara y entrega. Los clientes reciben un email en cada cambio de estado." />
      <Tabs
        active={`/admin/pedidos?vista=${view}`}
        items={VIEWS.map((v, i) => ({ href: `/admin/pedidos?vista=${v}`, label: labels[v], count: counts[i] }))}
      />
      {day && <p className="mb-3 text-sm text-cocoa-600">Mostrando pedidos para el {day}.</p>}
      <form className="mb-4 flex gap-2" action="/admin/pedidos">
        <input type="hidden" name="vista" value={view} />
        <label className="relative flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="Nº de pedido, nombre, email o teléfono" />
        </label>
        <button className="btn-dark btn-sm" type="submit">
          Buscar
        </button>
      </form>
      {orders.length ? (
        <div className="space-y-2">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} itemsSummary={o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")} />
          ))}
        </div>
      ) : (
        <Empty>No hay pedidos en esta vista.</Empty>
      )}
    </>
  );
}
