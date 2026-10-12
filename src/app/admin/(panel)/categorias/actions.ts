"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/format";
import { saveImage, UploadError } from "@/lib/storage";
import { bool, friendlyDbError, int, revalidateSite, str } from "@/lib/admin";
import type { ActionResult } from "@/components/admin/forms";

export async function saveCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData, "id");
  const name = str(formData, "name", 80);
  const slug = slugify(str(formData, "slug", 80) || name);
  if (name.length < 2 || !slug) return { ok: false, error: "Escribe un nombre" };
  const data = {
    name,
    slug,
    description: str(formData, "description", 300),
    content: str(formData, "content", 8000),
    seoTitle: str(formData, "seoTitle", 70) || null,
    seoDescription: str(formData, "seoDescription", 170) || null,
    sortOrder: int(formData, "sortOrder"),
    active: bool(formData, "active"),
    isDemo: false,
  };
  let savedId: string;
  try {
    const file = formData.get("image");
    let imageUrl: string | undefined;
    if (file instanceof File && file.size > 0) imageUrl = (await saveImage(file, "categories", 900)).url;
    const saved = id
      ? await db.category.update({ where: { id }, data: { ...data, ...(imageUrl ? { imageUrl } : {}) } })
      : await db.category.create({ data: { ...data, imageUrl } });
    savedId = saved.id;
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidateSite();
  if (!id) redirect(`/admin/categorias/${savedId}`);
  return { ok: true, message: "Categoría guardada" };
}

export async function deleteCategory(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const count = await db.product.count({ where: { categoryId: id } });
  if (count > 0) redirect(`/admin/categorias/${id}?error=productos`);
  await db.category.delete({ where: { id } });
  revalidateSite();
  redirect("/admin/categorias");
}
