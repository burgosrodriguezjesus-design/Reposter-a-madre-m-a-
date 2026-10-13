import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Eye, EyeOff, Plus, Search } from "lucide-react";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { DemoBadge } from "@/components/site/ui";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { fromPrice } from "@/lib/pricing";
import { toggleProductActive } from "./actions";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Productos" };

const AVAILABILITY: Record<string, { label: string; tone: string }> = {
  AVAILABLE: { label: "Disponible", tone: "bg-emerald-100 text-emerald-900" },
  ON_DEMAND: { label: "Por encargo", tone: "bg-sky-100 text-sky-900" },
  SEASONAL: { label: "Temporada", tone: "bg-gold-200 text-gold-700" },
  SOLD_OUT: { label: "Agotado", tone: "bg-stone-200 text-stone-700" },
};

export default async function ProductsPage({ searchParams }: PageProps<"/admin/productos">) {
  await requirePermission("catalog.manage");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.categoria === "string" ? params.categoria : "";
  const showArchived = params.archivados === "1";
  const where: Prisma.ProductWhereInput = {
    archived: showArchived,
    ...(category ? { categoryId: category } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where,
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, variants: true, category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Productos"
        description={`${products.length} productos${showArchived ? " archivados" : ""}`}
        actions={
          <Link href="/admin/productos/nuevo" className="btn-primary btn-sm">
            <Plus className="size-4" /> Nuevo producto
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/productos">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="Buscar producto" />
        </label>
        <select name="categoria" defaultValue={category} className="input w-auto">
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-dark btn-sm">Filtrar</button>
        <Link href={showArchived ? "/admin/productos" : "/admin/productos?archivados=1"} className="btn-ghost btn-sm">
          {showArchived ? "Ver activos" : "Ver archivados"}
        </Link>
      </form>

      {products.length === 0 ? (
        <Empty>No hay productos. Crea el primero con «Nuevo producto».</Empty>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-sand-300/60 bg-white p-2.5 pr-3">
              <Link href={`/admin/productos/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-cream-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.images[0] && <img src={p.images[0].url} alt="" className="size-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <strong className={p.active ? "text-cocoa-900" : "text-cocoa-400 line-through"}>{p.name}</strong>
                    {p.isDemo && <DemoBadge />}
                    {p.featured && <Badge className="bg-cocoa-800 text-cream-50">Destacado</Badge>}
                  </span>
                  <span className="block text-sm text-cocoa-500">
                    {p.category.name} · {p.variants.length > 1 ? "desde " : ""}
                    {formatPrice(fromPrice(p))}
                  </span>
                </span>
              </Link>
              <Badge className={`${AVAILABILITY[p.availability].tone} hidden sm:inline-flex`}>{AVAILABILITY[p.availability].label}</Badge>
              <form action={toggleProductActive}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn-ghost size-10 p-0" title={p.active ? "Ocultar de la web" : "Mostrar en la web"} aria-label={p.active ? "Ocultar de la web" : "Mostrar en la web"}>
                  {p.active ? <Eye className="size-4" /> : <EyeOff className="size-4 text-cocoa-400" />}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
