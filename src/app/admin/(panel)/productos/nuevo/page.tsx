import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { ProductForm } from "../ProductForm";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  await requirePermission("catalog.manage");
  const categories = await db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Nuevo producto" description="Después de crearlo podrás subir sus fotografías." back="/admin/productos" />
      {categories.length === 0 ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-amber-900">
          Primero crea una <Link href="/admin/categorias" className="underline">categoría</Link>.
        </p>
      ) : (
        <ProductForm
          categories={categories}
          initial={{
            name: "",
            slug: "",
            categoryId: categories[0].id,
            shortDescription: "",
            description: "",
            priceCents: 0,
            variants: [],
            optionGroups: [],
            ingredients: "",
            allergens: [],
            mayContain: [],
            occasions: [],
            allowDedication: false,
            allowReferencePhoto: false,
            availability: "AVAILABLE",
            leadTimeHours: 48,
            maxPerOrder: 10,
            featured: false,
            isNew: true,
            active: true,
            popularityBoost: 0,
            seoTitle: "",
            seoDescription: "",
          }}
        />
      )}
    </>
  );
}
