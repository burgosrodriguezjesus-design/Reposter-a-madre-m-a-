import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { DemoBadge, SmartImage } from "@/components/site/ui";
import { formatPrice } from "@/lib/format";
import type { ProductCardData } from "@/lib/catalog";

export function ProductBadges({ product }: { product: Pick<ProductCardData, "featured" | "isNew" | "availability" | "sales" | "popularityBoost"> }) {
  return (
    <>
      {product.availability === "SOLD_OUT" && <span className="badge bg-stone-700 text-white">Agotado</span>}
      {product.availability === "SEASONAL" && <span className="badge bg-gold-300 text-cocoa-900">Temporada</span>}
      {product.availability === "ON_DEMAND" && <span className="badge bg-white text-cocoa-800">Por encargo</span>}
      {product.isNew && <span className="badge bg-blush-600 text-white">Novedad</span>}
      {product.featured && <span className="badge bg-cocoa-800 text-cream-50">Más vendido</span>}
    </>
  );
}

/** headingLevel: 2 en listados que van directamente bajo el h1 (sin títulos de sección intermedios). */
export function ProductCard({ product, priority = false, headingLevel = 3 }: { product: ProductCardData; priority?: boolean; headingLevel?: 2 | 3 }) {
  const Title = headingLevel === 2 ? "h2" : "h3";
  const image = product.images[0];
  const servings = product.variants.find((v) => v.servings)?.servings;
  const multiple = product.variants.length > 1;
  return (
    <article className="group reveal relative flex flex-col overflow-hidden rounded-3xl border border-sand-300/60 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-cream-200">
        {image && (
          <SmartImage
            src={image.url}
            alt={image.alt}
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
            preload={priority}
          />
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <ProductBadges product={product} />
        </div>
        {product.isDemo && <DemoBadge className="absolute top-3 right-3" />}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="text-xs font-medium tracking-wide text-gold-700 uppercase">{product.category.name}</p>
        <Title className="mt-1 font-display text-lg leading-snug text-cocoa-900 sm:text-xl">
          <Link href={`/producto/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </Title>
        <p className="mt-1.5 line-clamp-2 text-sm text-cocoa-600">{product.shortDescription}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            <p className="text-lg font-semibold text-cocoa-900">
              {multiple && <span className="mr-1 text-xs font-normal text-cocoa-500">desde</span>}
              {formatPrice(product.fromPriceCents)}
            </p>
            {servings && (
              <p className="flex items-center gap-1 text-xs text-cocoa-500">
                <Users className="size-3.5" aria-hidden /> {servings}
              </p>
            )}
          </div>
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-blush-100 text-blush-700 transition group-hover:bg-blush-600 group-hover:text-white" aria-hidden>
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
