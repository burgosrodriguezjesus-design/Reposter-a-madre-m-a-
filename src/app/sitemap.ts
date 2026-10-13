import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { MIN_ZONE_TEXT } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { getLandings } from "@/content/landings";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [settings, categories, products, zones] = await Promise.all([
    getSettings(),
    db.category.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    db.product.findMany({
      where: { active: true, archived: false, category: { active: true } },
      select: { slug: true, updatedAt: true, images: { select: { url: true }, take: 3, orderBy: { sortOrder: "asc" } } },
    }),
    db.deliveryZone.findMany({ where: { active: true }, select: { slug: true, description: true } }),
  ]);
  const now = new Date();
  const absolute = (u: string) => (/^https?:\/\//.test(u) ? u : siteUrl(u));

  const pages: MetadataRoute.Sitemap = [
    { url: siteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("/productos"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: siteUrl("/personalizar-tarta"), changeFrequency: "monthly", priority: 0.8 },
    { url: siteUrl("/donde-estamos"), changeFrequency: "monthly", priority: 0.7 },
    { url: siteUrl("/opiniones"), changeFrequency: "weekly", priority: 0.5 },
    ...(settings.marketing.giftCardsEnabled ? [{ url: siteUrl("/tarjetas-regalo"), changeFrequency: "monthly" as const, priority: 0.5 }] : []),
    ...getLandings(settings.business).map((l) => ({ url: siteUrl(`/${l.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...categories.map((c) => ({ url: siteUrl(`/categoria/${c.slug}`), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({
      url: siteUrl(`/producto/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: p.images.map((i) => absolute(i.url)),
    })),
    ...(settings.ordering.deliveryEnabled ? zones : [])
      .filter((z) => z.description.trim().length >= MIN_ZONE_TEXT)
      .map((z) => ({ url: siteUrl(`/zonas/${z.slug}`), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...["aviso-legal", "privacidad", "cookies", "condiciones-de-compra", "cancelaciones", "alergenos"].map((p) => ({
      url: siteUrl(`/${p}`),
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
  return pages;
}
