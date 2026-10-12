import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, Leaf, Store, Truck } from "lucide-react";
import { ProductCard, ProductBadges } from "@/components/site/ProductCard";
import { ProductConfigurator } from "@/components/site/ProductConfigurator";
import { Breadcrumbs, DemoBadge, Paragraphs, SmartImage } from "@/components/site/ui";
import { JsonLd } from "@/components/site/JsonLd";
import { WhatsAppIcon } from "@/components/icons";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ALLERGENS, allergenLabel, occasionLabel } from "@/lib/allergens";
import { fromPrice, parseOptionGroups } from "@/lib/pricing";
import { formatPrice, whatsappLink } from "@/lib/format";
import { productSchema } from "@/lib/structured-data";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 300;

/** Sin páginas en la compilación: cada una se genera en su primera visita y queda en caché (ISR). */
export async function generateStaticParams() {
  return [];
}

function leadTimeText(hours: number) {
  if (hours <= 0) return "Disponible para el mismo día (según existencias)";
  if (hours < 48) return `Encárgalo con al menos ${hours} h de antelación`;
  return `Encárgalo con al menos ${Math.round(hours / 24)} días de antelación`;
}

export async function generateMetadata({ params }: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [product, { business }] = await Promise.all([getProductBySlug(slug), getSettings()]);
  if (!product) return {};
  const price = formatPrice(fromPrice(product));
  const image = product.images[0];
  return {
    title: product.seoTitle || `${product.name} · ${product.category.name} en ${business.city}`,
    description:
      product.seoDescription ||
      `${product.shortDescription} Desde ${price}. Encarga online en ${business.name} (${business.city}) y recoge en tienda o recíbelo en casa.`.slice(0, 300),
    alternates: { canonical: `/producto/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.name,
      description: product.shortDescription,
      images: image && !image.url.endsWith(".svg") ? [{ url: image.url, alt: image.alt }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const [settings, related] = await Promise.all([getSettings(), getRelatedProducts(product.id, product.categoryId)]);
  const b = settings.business;
  const optionGroups = parseOptionGroups(product.optionGroups);
  const leadHours = Math.max(product.leadTimeHours, settings.ordering.minLeadHours);
  const mainImage = product.images[0];

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumbs
        items={[
          { name: "Productos", path: "/productos" },
          { name: product.category.name, path: `/categoria/${product.category.slug}` },
          { name: product.name, path: `/producto/${product.slug}` },
        ]}
      />

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Galería */}
        <div className="space-y-3 lg:sticky lg:top-28 lg:self-start">
          <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-sand-300/60 bg-cream-200 shadow-soft">
            {mainImage && (
              <SmartImage src={mainImage.url} alt={mainImage.alt} fill preload sizes="(min-width: 1024px) 600px, 92vw" className="object-cover" />
            )}
            <div className="absolute top-4 left-4 flex flex-wrap gap-1.5">
              <ProductBadges product={{ ...product, sales: 0 }} />
            </div>
            {product.isDemo && <DemoBadge className="absolute top-4 right-4" />}
          </div>
          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.images.slice(1, 5).map((img) => (
                <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl border border-sand-300/60 bg-cream-200">
                  <SmartImage src={img.url} alt={img.alt} fill sizes="150px" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Información y compra */}
        <div>
          <p className="eyebrow">{product.category.name}</p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-cocoa-900 sm:text-5xl">{product.name}</h1>
          <p className="mt-3 text-lg text-cocoa-600">{product.shortDescription}</p>
          <p className="mt-4 text-2xl font-semibold text-cocoa-900">
            {product.variants.length > 1 && <span className="mr-1.5 text-base font-normal text-cocoa-500">desde</span>}
            {formatPrice(fromPrice(product))}
          </p>

          <ul className="mt-5 grid gap-2 text-sm text-cocoa-700 sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 text-gold-600" /> {leadTimeText(leadHours)}
            </li>
            <li className="flex items-center gap-2">
              <Store className="size-4 text-gold-600" /> Recogida en {b.neighborhood || b.city}
            </li>
            {settings.ordering.deliveryEnabled && (
              <li className="flex items-center gap-2">
                <Truck className="size-4 text-gold-600" /> Entrega a domicilio en zonas de reparto
              </li>
            )}
            {product.availability === "SEASONAL" && (
              <li className="flex items-center gap-2">
                <Leaf className="size-4 text-gold-600" /> Producto de temporada
              </li>
            )}
          </ul>

          <div className="card mt-8 p-5 sm:p-7">
            <ProductConfigurator
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                image: mainImage?.url,
                priceCents: product.priceCents,
                variants: product.variants.map((v) => ({ id: v.id, name: v.name, servings: v.servings, priceCents: v.priceCents })),
                optionGroups,
                allowDedication: product.allowDedication,
                allowReferencePhoto: product.allowReferencePhoto,
                maxPerOrder: product.maxPerOrder,
                leadTimeHours: leadHours,
                soldOut: product.availability === "SOLD_OUT",
              }}
            />
          </div>

          {b.whatsapp && (
            <a
              href={whatsappLink(b.whatsapp, `Hola, tengo una pregunta sobre «${product.name}»: ${siteUrl(`/producto/${product.slug}`)}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cocoa-700 hover:text-blush-700"
            >
              <WhatsAppIcon className="size-4 text-[#1DA851]" /> ¿Dudas? Pregúntanos por WhatsApp
            </a>
          )}

          <section className="mt-10 space-y-8">
            <div>
              <h2 className="font-display text-2xl text-cocoa-900">Descripción</h2>
              <Paragraphs text={product.description} className="mt-3" />
              {product.occasions.length > 0 && (
                <p className="mt-4 flex flex-wrap gap-2">
                  {product.occasions.map((o) => (
                    <span key={o} className="badge bg-cream-200 text-cocoa-700">
                      {occasionLabel(o)}
                    </span>
                  ))}
                </p>
              )}
            </div>
            {product.ingredients && (
              <div>
                <h2 className="font-display text-2xl text-cocoa-900">Ingredientes</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-cocoa-700">{product.ingredients}</p>
              </div>
            )}
            <div>
              <h2 className="font-display text-2xl text-cocoa-900">Alérgenos</h2>
              {product.allergens.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {ALLERGENS.filter((a) => product.allergens.includes(a.key)).map((a) => (
                    <li key={a.key} className="badge border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900">
                      <span aria-hidden>{a.emoji}</span> Contiene {a.label.toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-cocoa-700">Sin alérgenos de declaración obligatoria en la receta.</p>
              )}
              {product.mayContain.length > 0 && (
                <p className="mt-3 text-sm text-cocoa-600">
                  Puede contener trazas de: {product.mayContain.map((k) => allergenLabel(k).toLowerCase()).join(", ")}.
                </p>
              )}
              <p className="mt-3 flex gap-2 rounded-2xl bg-cream-200/70 p-3 text-sm text-cocoa-600">
                <AlertTriangle className="size-4 shrink-0 text-amber-700" /> {settings.ordering.allergenNotice}
              </p>
            </div>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="section-title">También te puede gustar</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <JsonLd
        data={productSchema({
          name: product.name,
          slug: product.slug,
          description: product.shortDescription || product.description.slice(0, 300),
          images: product.images.map((i) => i.url),
          priceCents: product.priceCents,
          variants: product.variants,
          availability: product.availability,
          categoryName: product.category.name,
          brand: b.name,
          allergens: product.allergens.map(allergenLabel),
        })}
      />
    </div>
  );
}
