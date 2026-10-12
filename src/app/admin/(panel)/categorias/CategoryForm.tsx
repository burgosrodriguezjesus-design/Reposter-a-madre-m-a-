import type { Category } from "@prisma/client";
import { Check, Field } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { saveCategory } from "./actions";

export function CategoryForm({ category }: { category?: Category }) {
  return (
    <ActionForm action={saveCategory} className="space-y-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input name="name" required defaultValue={category?.name} className="input" />
        </Field>
        <Field label="URL" hint="/categoria/… (se genera del nombre si la dejas vacía)">
          <input name="slug" defaultValue={category?.slug} className="input" />
        </Field>
        <Field label="Descripción corta" className="sm:col-span-2">
          <input name="description" maxLength={300} defaultValue={category?.description} className="input" />
        </Field>
        <Field
          label="Texto de la página (SEO)"
          className="sm:col-span-2"
          hint="Texto original y útil sobre esta categoría: cómo la elaboráis, para qué ocasiones, plazos… Separa párrafos con una línea en blanco."
        >
          <textarea name="content" rows={7} defaultValue={category?.content} className="input" />
        </Field>
        <Field label="Título para Google (opcional)">
          <input name="seoTitle" maxLength={70} defaultValue={category?.seoTitle ?? ""} className="input" />
        </Field>
        <Field label="Metadescripción (opcional)">
          <input name="seoDescription" maxLength={170} defaultValue={category?.seoDescription ?? ""} className="input" />
        </Field>
        <Field label="Orden" hint="Menor número = aparece antes">
          <input name="sortOrder" type="number" defaultValue={category?.sortOrder ?? 0} className="input" />
        </Field>
        <Field label="Imagen" hint={category?.imageUrl ? "Sube una nueva para reemplazar la actual" : undefined}>
          <input type="file" name="image" accept="image/*" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-blush-100 file:px-4 file:py-2 file:font-semibold file:text-blush-800" />
        </Field>
      </div>
      <Check name="active" label="Visible en la web" defaultChecked={category?.active ?? true} />
      <SubmitButton>{category ? "Guardar cambios" : "Crear categoría"}</SubmitButton>
    </ActionForm>
  );
}
