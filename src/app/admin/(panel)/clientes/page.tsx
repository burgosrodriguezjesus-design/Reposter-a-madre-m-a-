import { Download, Search, Trash2 } from "lucide-react";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/crypto";
import { matchesText, parsePiiQuery, SCAN_LIMIT } from "@/lib/pii-search";
import { formatPrice } from "@/lib/format";
import { deleteCustomerData } from "./actions";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  const admin = await requirePermission("customers.view");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const search = parsePiiQuery(query);
  await auditAdmin(admin, { action: "customers.list", entity: "Customer", details: { search: search.kind } });
  const found = await db.customer.findMany({
    where: search.kind === "email" ? { emailHash: search.hash } : {},
    include: { _count: { select: { orders: true, reminders: { where: { active: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: search.kind === "text" || search.kind === "phone" ? SCAN_LIMIT : 200,
  });
  // Nombre y teléfono están cifrados: se comparan tras descifrar los clientes más recientes.
  const phone = search.kind === "phone" ? normalizePhone(query) : "";
  const customers =
    search.kind === "text"
      ? found.filter((c) => matchesText(search.needle, c.name, c.email)).slice(0, 200)
      : search.kind === "phone"
        ? found.filter((c) => c.phone && normalizePhone(c.phone) === phone).slice(0, 200)
        : found;
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Se crean automáticamente con cada pedido. Solo puedes enviar publicidad a quien lo ha autorizado."
        actions={
          can(admin.role, "customers.export") ? (
            <a href="/api/admin/clientes.csv" className="btn-outline btn-sm">
              <Download className="size-4" /> Exportar con consentimiento (CSV)
            </a>
          ) : null
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
              {can(admin.role, "customers.delete") && (
              <form action={deleteCustomerData}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton
                  message={`¿Eliminar los datos de ${c.email}? Se borran su ficha, recordatorios, carritos y fotos, y se anonimizan sus pedidos cerrados (los importes se conservan por obligación legal). Los pedidos en curso no se tocan.`}
                  className="btn-ghost size-9 p-0 text-cocoa-400 hover:text-red-700"
                >
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
