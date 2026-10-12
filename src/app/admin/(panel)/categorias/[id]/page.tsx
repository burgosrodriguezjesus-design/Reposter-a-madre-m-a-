import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { Card, PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { CategoryForm } from "../CategoryForm";
import { deleteCategory } from "../actions";

export const metadata = { title: "Editar categoría" };

export default async function EditCategoryPage({ params, searchParams }: PageProps<"/admin/categorias/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const category = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!category) notFound();
  return (
    <>
      <PageHeader
        title={category.name}
        back="/admin/categorias"
        actions={
          <Link href={`/categoria/${category.slug}`} target="_blank" className="btn-outline btn-sm">
            <ExternalLink className="size-4" /> Ver en la web
          </Link>
        }
      />
      {query.error === "productos" && (
        <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-amber-900">No se puede borrar: mueve o elimina antes sus productos.</p>
      )}
      <Card>
        <CategoryForm category={category} />
      </Card>
      <Card title="Eliminar categoría" className="mt-6">
        <p className="mb-3 text-sm text-cocoa-600">
          {category._count.products > 0 ? `Tiene ${category._count.products} productos: muévelos a otra categoría antes de borrarla.` : "La categoría está vacía y se puede borrar."}
        </p>
        <form action={deleteCategory}>
          <input type="hidden" name="id" value={category.id} />
          <ConfirmButton message="¿Eliminar esta categoría?" className="btn-outline btn-sm text-red-700">
            <Trash2 className="size-4" /> Eliminar
          </ConfirmButton>
        </form>
      </Card>
    </>
  );
}
