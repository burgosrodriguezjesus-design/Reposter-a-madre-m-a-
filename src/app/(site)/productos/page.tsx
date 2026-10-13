import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { ProductCard } from "@/components/site/ProductCard";
import { AutoSubmit } from "@/components/site/AutoSubmit";
import { Breadcrumbs } from "@/components/site/ui";
import { getCategories, getProducts, type CatalogFilters } from "@/lib/catalog";
import { OCCASIONS } from "@/lib/allergens";
import { getSettings } from "@/lib/settings";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORTS = [
  { value: "popular", label: "Más populares" },
  { value: "new", label: "Novedades" },
  { value: "price-asc", label: "Precio: de menor a mayor" },
  { value: "price-desc", label: "Precio: de mayor a menor" },
] as const;

const PRICES = [
  { value: "15", label: "Hasta 15 €" },
  { value: "30", label: "Hasta 30 €" },
  { value: "50", label: "Hasta 50 €" },
  { value: "100", label: "Hasta 100 €" },
];

function str(value: string | string[] | undefined) {
  return typeof value === "string" ? value.slice(0, 60) : undefined;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const { business } = await getSettings();
  const filtered = Object.values(params).some(Boolean);
  return {
    title: `Tartas, cupcakes y dulces por encargo en ${business.city}`,
    description: `Catálogo de ${business.name}: tartas personalizadas, de cumpleaños y de boda, cupcakes, galletas, brownies y postres. Precios, tamaños, alérgenos y pedido online.`,
    alternates: { canonical: "/productos" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const sortParam = str(params.orden);
  const filters: CatalogFilters = {
    category: str(params.categoria),
    occasion: str(params.ocasion),
    maxPrice: str(params.precio) ? Number(str(params.precio)) * 100 || undefined : undefined,
    sort: SORTS.some((s) => s.value === sortParam) ? (sortParam as CatalogFilters["sort"]) : "popular",
    q: str(params.q)?.trim() || undefined,
  };
  const [products, categories] = await Promise.all([getProducts(filters), getCategories()]);

  const linkWith = (key: string, value?: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) next.set(k, v);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return qs ? `/productos?${qs}` : "/productos";
  };

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: "Productos", path: "/productos" }]} />
      <div className="mt-6 max-w-3xl">
        <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Nuestros productos</h1>
        <p className="mt-3 text-lg text-cocoa-600">
          Todo se elabora por encargo en nuestro obrador. Elige tamaño y opciones, reserva el día y te lo tenemos listo.
        </p>
      </div>

      {/* Categorías */}
      <nav aria-label="Categorías" className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={linkWith("categoria")} className={clsx("chip shrink-0", !filters.category && "chip-active")}>
          Todo
        </Link>
        {categories.map((c) => (
          <Link key={c.id} href={linkWith("categoria", c.slug)} className={clsx("chip shrink-0", filters.category === c.slug && "chip-active")}>
            {c.name}
          </Link>
        ))}
      </nav>

      {/* Filtros */}
      <form method="get" action="/productos" className="mt-4 flex flex-wrap items-end gap-3 rounded-3xl border border-sand-300/60 bg-white/70 p-4">
        <AutoSubmit />
        {filters.category && <input type="hidden" name="categoria" value={filters.category} />}
        <span className="hidden items-center gap-2 text-sm font-semibold text-cocoa-700 sm:flex">
          <SlidersHorizontal className="size-4" /> Filtrar
        </span>
        <label className="min-w-[150px] flex-1 sm:flex-none">
          <span className="sr-only">Ocasión</span>
          <select name="ocasion" defaultValue={filters.occasion ?? ""} className="input py-2">
            <option value="">Cualquier ocasión</option>
            {OCCASIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[130px] flex-1 sm:flex-none">
          <span className="sr-only">Precio máximo</span>
          <select name="precio" defaultValue={str(params.precio) ?? ""} className="input py-2">
            <option value="">Cualquier precio</option>
            {PRICES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1 sm:flex-none">
          <span className="sr-only">Ordenar por</span>
          <select name="orden" defaultValue={filters.sort} className="input py-2">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-[2]">
          <span className="sr-only">Buscar</span>
          <input type="search" name="q" defaultValue={filters.q} placeholder="Buscar: chocolate, queso, galletas…" className="input py-2" />
        </label>
        <button type="submit" className="btn-dark btn-sm" data-nojs>
          Aplicar
        </button>
      </form>

      <p className="mt-6 text-sm text-cocoa-500" aria-live="polite">
        {products.length} {products.length === 1 ? "producto" : "productos"}
      </p>

      {products.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} priority={i < 2} headingLevel={2} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-sand-400 p-10 text-center">
          <p className="font-display text-2xl text-cocoa-900">No hemos encontrado productos con esos filtros</p>
          <p className="mt-2 text-cocoa-600">Prueba con otros filtros o diseña una tarta a tu medida.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/productos" className="btn-outline">
              Quitar filtros
            </Link>
            <Link href="/personalizar-tarta" className="btn-primary">
              Personalizar tarta
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
