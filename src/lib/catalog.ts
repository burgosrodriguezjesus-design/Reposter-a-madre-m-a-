import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES } from "@/lib/order-status";
import { fromPrice } from "@/lib/pricing";

export const productCardInclude = {
  images: { orderBy: { sortOrder: "asc" }, take: 1 },
  variants: { orderBy: { sortOrder: "asc" } },
  category: { select: { slug: true, name: true } },
} satisfies Prisma.ProductInclude;

export type ProductCardData = Prisma.ProductGetPayload<{ include: typeof productCardInclude }> & {
  fromPriceCents: number;
  sales: number;
};

const visible = { active: true, archived: false, category: { active: true } } satisfies Prisma.ProductWhereInput;

export const getCategories = cache(async () =>
  db.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { active: true, archived: false } } } } },
  }),
);

/** Unidades vendidas por producto en los últimos 120 días (popularidad real). */
export const getSalesByProduct = cache(async (): Promise<Map<string, number>> => {
  const rows = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { status: { in: ACTIVE_ORDER_STATUSES }, createdAt: { gte: new Date(Date.now() - 120 * 86_400_000) } },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId!, r._sum.quantity ?? 0]));
});

function enrich(
  products: Prisma.ProductGetPayload<{ include: typeof productCardInclude }>[],
  sales: Map<string, number>,
): ProductCardData[] {
  return products.map((p) => ({ ...p, fromPriceCents: fromPrice(p), sales: sales.get(p.id) ?? 0 }));
}

export type CatalogFilters = {
  category?: string;
  occasion?: string;
  maxPrice?: number;
  sort?: "popular" | "price-asc" | "price-desc" | "new";
  q?: string;
};

export async function getProducts(filters: CatalogFilters = {}): Promise<ProductCardData[]> {
  const where: Prisma.ProductWhereInput = { ...visible };
  if (filters.category) where.category = { slug: filters.category, active: true };
  if (filters.occasion) where.occasions = { has: filters.occasion };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { shortDescription: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const [products, sales] = await Promise.all([
    db.product.findMany({ where, include: productCardInclude, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
    getSalesByProduct(),
  ]);
  let list = enrich(products, sales);
  if (filters.maxPrice) list = list.filter((p) => p.fromPriceCents <= filters.maxPrice!);

  const score = (p: ProductCardData) => p.sales + p.popularityBoost + (p.featured ? 5 : 0);
  switch (filters.sort ?? "popular") {
    case "price-asc":
      list.sort((a, b) => a.fromPriceCents - b.fromPriceCents);
      break;
    case "price-desc":
      list.sort((a, b) => b.fromPriceCents - a.fromPriceCents);
      break;
    case "new":
      list.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.createdAt.getTime() - a.createdAt.getTime());
      break;
    default:
      list.sort((a, b) => score(b) - score(a));
  }
  return list;
}

export async function getBestsellers(limit = 4) {
  return (await getProducts({ sort: "popular" })).filter((p) => p.availability !== "SOLD_OUT").slice(0, limit);
}

export async function getNewProducts(limit = 4) {
  return (await getProducts({ sort: "new" })).filter((p) => p.isNew).slice(0, limit);
}

export const getProductBySlug = cache(async (slug: string) =>
  db.product.findFirst({
    where: { slug, ...visible },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      category: true,
    },
  }),
);

export async function getRelatedProducts(productId: string, categoryId: string, limit = 4) {
  const [products, sales] = await Promise.all([
    db.product.findMany({
      where: { ...visible, categoryId, id: { not: productId } },
      include: productCardInclude,
      take: limit,
      orderBy: { sortOrder: "asc" },
    }),
    getSalesByProduct(),
  ]);
  return enrich(products, sales);
}

export const getApprovedReviews = cache(async (limit = 12) =>
  db.review.findMany({ where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: limit }),
);

export const getReviewStats = cache(async () => {
  const agg = await db.review.aggregate({
    where: { status: "APPROVED", isDemo: false },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return { average: agg._avg.rating ?? 0, count: agg._count._all };
});

export const getActivePromotions = cache(async () => {
  const now = new Date();
  return db.promotion.findMany({
    where: {
      active: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { sortOrder: "asc" },
  });
});

/** Solo se publica la página de una zona si tiene un texto propio suficientemente completo (evita páginas vacías o duplicadas). */
export const MIN_ZONE_TEXT = 300;

export const getDeliveryZones = cache(async () =>
  db.deliveryZone.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
);

export const hasDemoContent = cache(async () => {
  const [p, c, r] = await Promise.all([
    db.product.count({ where: { isDemo: true } }),
    db.category.count({ where: { isDemo: true } }),
    db.review.count({ where: { isDemo: true } }),
  ]);
  return p + c + r > 0;
});
