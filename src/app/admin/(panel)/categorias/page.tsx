import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { DemoBadge } from "@/components/site/ui";
import { db } from "@/lib/db";
import { CategoryForm } from "./CategoryForm";

export const metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  const categories = await db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader title="Categorías" description="Organizan el catálogo y cada una tiene su propia página optimizada para Google." />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/categorias/${c.id}`} className="flex items-center gap-3 rounded-xl border border-sand-300/60 bg-white p-2.5 hover:border-blush-300">
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-cream-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.imageUrl && <img src={c.imageUrl} alt="" className="size-full object-cover" />}
                </span>
                <span className="flex-1">
                  <strong className={c.active ? "" : "text-cocoa-400 line-through"}>{c.name}</strong>
                  <span className="block text-sm text-cocoa-500">
                    /categoria/{c.slug} · {c._count.products} productos
                  </span>
                </span>
                {c.isDemo && <DemoBadge />}
              </Link>
            </li>
          ))}
        </ul>
        <Card title="Nueva categoría">
          <CategoryForm />
        </Card>
      </div>
    </>
  );
}
