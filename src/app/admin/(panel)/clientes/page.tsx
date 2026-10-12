import { Download, Search, Trash2 } from "lucide-react";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { deleteCustomerData } from "./actions";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const customers = await db.customer.findMany({
    where: query
      ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query.toLowerCase() } }, { phone: { contains: query } }] }
      : {},
    include: { _count: { select: { orders: true, reminders: { where: { active: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Se crean automáticamente con cada pedido. Solo puedes enviar publicidad a quien lo ha autorizado."
        actions={
          <a href="/api/admin/clientes.csv" className="btn-outline btn-sm">
            <Download className="size-4" /> Exportar con consentimiento (CSV)
          </a>
        }
      />
      <form className="mb-4 flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
          <input name="q" defaultValue={query} className="input pl-9" placeholder="Nombre, email o teléfono" aria-label="Buscar cliente" />
        </label>
        <button className="btn-dark btn-sm">Buscar</button>
      </form>
      {customers.length === 0 ? (
        <Empty>Todavía no hay clientes.</Empty>
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-sand-300/60 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-cocoa-900">{c.name}</p>
                <p className="truncate text-sm text-cocoa-600">
                  {c.email} {c.phone ? `· ${c.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge className="bg-cream-200 text-cocoa-700">{c._count.orders} pedidos</Badge>
                <Badge className="bg-cream-200 text-cocoa-700">{formatPrice(c.totalSpentCents)}</Badge>
                <Badge className="bg-gold-200 text-gold-700">{c.loyaltyStamps} sellos</Badge>
                {c.marketingConsent && <Badge className="bg-emerald-100 text-emerald-900">Acepta novedades</Badge>}
                {c._count.reminders > 0 && <Badge className="bg-blush-100 text-blush-800">{c._count.reminders} recordatorios</Badge>}
              </div>
              <form action={deleteCustomerData}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton
                  message={`¿Eliminar los datos de ${c.email}? Se borran su ficha, recordatorios y carritos; los pedidos se conservan por obligación legal.`}
                  className="btn-ghost size-9 p-0 text-cocoa-400 hover:text-red-700"
                >
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
