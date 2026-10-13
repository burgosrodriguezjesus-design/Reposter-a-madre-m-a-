/**
 * Exporta los productos que se pueden pedir sin opciones obligatorias a un JSON para k6
 * (k6 no puede consultar la base de datos). Solo identificadores públicos: sin datos personales.
 *
 *   DATABASE_URL=<bd de staging> node loadtest/k6/export-catalog.mjs > loadtest/k6/catalog.json
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const products = await db.product.findMany({
    where: { active: true, archived: false, availability: { in: ["AVAILABLE", "ON_DEMAND"] } },
    select: { id: true, slug: true, stock: true, allowDedication: true, optionGroups: true, leadTimeHours: true, maxPerOrder: true, variants: { select: { id: true }, take: 1 }, category: { select: { slug: true } } },
  });
  const orderable = products
    .filter((p) => p.stock === null && !p.allowDedication && Array.isArray(p.optionGroups) && p.optionGroups.every((g) => !g.required) && p.leadTimeHours <= 72 && p.maxPerOrder >= 2)
    .map((p) => ({ id: p.id, slug: p.slug, variantId: p.variants[0]?.id ?? null, leadTimeHours: p.leadTimeHours }));
  const out = {
    slugs: products.map((p) => p.slug),
    categories: [...new Set(products.map((p) => p.category.slug))],
    orderable,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} finally {
  await db.$disconnect();
}
