import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Star, Trash2 } from "lucide-react";
import { Card, PageHeader } from "@/components/admin/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/forms";
import { DemoBadge } from "@/components/site/ui";
import { db } from "@/lib/db";
import { parseOptionGroups } from "@/lib/pricing";
import { ProductForm } from "../ProductForm";
import { deleteProduct, updateProductImage, uploadProductImages } from "../actions";

export const metadata = { title: "Editar producto" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/productos/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [product, categories, sold] = await Promise.all([
    db.product.findUnique({ where: { id }, include: { images: { orderBy: { sortOrder: "asc" } }, variants: { orderBy: { sortOrder: "asc" } } } }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.orderItem.count({ where: { productId: id } }),
  ]);
  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={product.name}
        back="/admin/productos"
        actions={
          <>
            {product.isDemo && <DemoBadge className="self-center" />}
            <Link href={`/producto/${product.slug}`} target="_blank" className="btn-outline btn-sm">
              <ExternalLink className="size-4" /> Ver en la web
            </Link>
          </>
        }
      />
      {query.nuevo === "1" && (
        <p className="mb-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900">Producto creado. Ahora añade sus fotografías 📸</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <ProductForm
          categories={categories}
          initial={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            categoryId: product.categoryId,
            shortDescription: product.shortDescription,
            description: product.description,
            priceCents: product.priceCents,
            variants: product.variants.map((v) => ({ id: v.id, name: v.name, servings: v.servings ?? "", priceCents: v.priceCents })),
            optionGroups: parseOptionGroups(product.optionGroups),
            ingredients: product.ingredients,
            allergens: product.allergens,
            mayContain: product.mayContain,
            occasions: product.occasions,
            allowDedication: product.allowDedication,
            allowReferencePhoto: product.allowReferencePhoto,
            availability: product.availability,
            leadTimeHours: product.leadTimeHours,
            maxPerOrder: product.maxPerOrder,
            featured: product.featured,
            isNew: product.isNew,
            active: product.active,
            popularityBoost: product.popularityBoost,
            seoTitle: product.seoTitle ?? "",
            seoDescription: product.seoDescription ?? "",
          }}
        />

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card title="Fotografías">
            <p className="mb-3 text-xs text-cocoa-500">
              Se convierten automáticamente a WebP optimizado. La primera es la principal. Describe cada foto: ayuda en Google Imágenes y a
              personas con discapacidad visual.
            </p>
            <ul className="space-y-3">
              {product.images.map((img, i) => (
                <li key={img.id} className="rounded-xl border border-sand-300/70 p-2">
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt} className="size-20 shrink-0 rounded-lg object-cover" />
                    <ActionForm action={updateProductImage} className="min-w-0 flex-1">
                      <input type="hidden" name="imageId" value={img.id} />
                      <textarea name="alt" defaultValue={img.alt} rows={2} className="input py-1.5 text-sm" aria-label="Texto alternativo" />
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <SubmitButton className="btn-dark btn-sm min-h-8 px-3 text-xs">Guardar</SubmitButton>
                        {i > 0 && (
                          <button name="intent" value="first" className="btn-ghost btn-sm min-h-8 px-2 text-xs">
                            <Star className="size-3.5" /> Principal
                          </button>
                        )}
                        <button name="intent" value="delete" className="btn-ghost btn-sm min-h-8 px-2 text-xs text-red-700">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
            <ActionForm action={uploadProductImages} className="mt-4" resetOnSuccess>
              <input type="hidden" name="productId" value={product.id} />
              <input type="file" name="files" accept="image/*" multiple className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-blush-100 file:px-4 file:py-2 file:font-semibold file:text-blush-800" />
              <SubmitButton className="btn-primary btn-sm mt-3" pendingText="Subiendo…">
                Subir fotos
              </SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Eliminar">
            <p className="mb-3 text-sm text-cocoa-600">
              {sold > 0
                ? `Este producto aparece en ${sold} pedido(s): se archivará para conservar el historial.`
                : "Se eliminará definitivamente junto con sus fotos."}
            </p>
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ConfirmButton message="¿Seguro que quieres eliminar este producto?" className="btn-outline btn-sm text-red-700">
                <Trash2 className="size-4" /> {sold > 0 ? "Archivar producto" : "Eliminar producto"}
              </ConfirmButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
