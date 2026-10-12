import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { getLandings } from "@/content/landings";
import { buildFaqs } from "@/content/faqs";
import { ProductCard } from "@/components/site/ProductCard";
import { LocationBlock } from "@/components/site/LocationBlock";
import { Faq } from "@/components/site/Faq";
import { Breadcrumbs } from "@/components/site/ui";
import { getSettings } from "@/lib/settings";
import { getBestsellers, getDeliveryZones, getProducts, MIN_ZONE_TEXT } from "@/lib/catalog";
import { getOpeningSchedule } from "@/lib/schedule";
import { paymentOptions } from "@/lib/checkout";
import { formatPrice } from "@/lib/format";

export const revalidate = 600;

/** Sin páginas en la compilación: cada una se genera en su primera visita y queda en caché (ISR). */
export async function generateStaticParams() {
  return [];
}

async function findLanding(slug: string) {
  const settings = await getSettings();
  return { settings, landing: getLandings(settings.business).find((l) => l.slug === slug) };
}

export async function generateMetadata({ params }: PageProps<"/[landing]">): Promise<Metadata> {
  const { landing: slug } = await params;
  const { landing } = await findLanding(slug);
  if (!landing) return {};
  return {
    title: { absolute: landing.metaTitle },
    description: landing.metaDescription,
    alternates: { canonical: `/${landing.slug}` },
    openGraph: { title: landing.metaTitle, description: landing.metaDescription },
  };
}

export default async function LandingPage({ params }: PageProps<"/[landing]">) {
  const { landing: slug } = await params;
  const { settings, landing } = await findLanding(slug);
  if (!landing) notFound();

  const [products, zones, schedule] = await Promise.all([
    landing.categorySlug ? getProducts({ category: landing.categorySlug }) : getBestsellers(8),
    getDeliveryZones(),
    getOpeningSchedule(),
  ]);
  const b = settings.business;
  const faqs = buildFaqs(landing.faqKeys, { settings, zones, schedule, products, payments: paymentOptions(settings) });
  const others = getLandings(b).filter((l) => l.slug !== landing.slug);
  const priced = landing.categorySlug ? products.filter((p) => p.variants.length > 0 || p.priceCents > 0).slice(0, 8) : [];

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: landing.label, path: `/${landing.slug}` }]} />

      <header className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="eyebrow">{b.name}</p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-cocoa-900 sm:text-5xl">{landing.h1}</h1>
          <div className="prose-content mt-5 text-[17px]">
            {landing.intro.filter(Boolean).map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={landing.ctaHref} className="btn-primary">
              {landing.ctaLabel} <ArrowRight className="size-4" />
            </Link>
            {settings.builder.enabled && landing.ctaHref !== "/personalizar-tarta" && (
              <Link href="/personalizar-tarta" className="btn-outline">
                <Sparkles className="size-4" /> Personalizar tarta
              </Link>
            )}
          </div>
        </div>
        <ul className="grid gap-3">
          {landing.highlights.map((h) => (
            <li key={h.title} className="card p-5">
              <strong className="block font-display text-lg text-cocoa-900">{h.title}</strong>
              <span className="text-sm text-cocoa-600">{h.text}</span>
            </li>
          ))}
        </ul>
      </header>

      {products.length > 0 && (
        <section className="mt-16">
          <h2 className="section-title">{landing.categorySlug ? "Elige la tuya" : "Los más pedidos"}</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {products.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {priced.length > 0 && (
        <section className="mt-16">
          <h2 className="section-title">Precios y tamaños</h2>
          <p className="mt-2 text-cocoa-600">Precios actualizados de nuestra tienda online. IVA incluido.</p>
          <div className="mt-6 overflow-x-auto rounded-3xl border border-sand-300/60 bg-white shadow-soft">
            <table className="w-full min-w-[520px] text-left text-[15px]">
              <thead className="bg-cream-100 text-sm text-cocoa-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">Producto</th>
                  <th className="px-5 py-3 font-semibold">Tamaño / raciones</th>
                  <th className="px-5 py-3 text-right font-semibold">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-300/50">
                {priced.flatMap((p) =>
                  (p.variants.length ? p.variants : [{ id: p.id, name: "Única", servings: null, priceCents: p.priceCents }]).map((v, i) => (
                    <tr key={v.id}>
                      <td className="px-5 py-3">
                        {i === 0 && (
                          <Link href={`/producto/${p.slug}`} className="font-medium text-cocoa-900 hover:text-blush-700">
                            {p.name}
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3 text-cocoa-600">
                        {v.name}
                        {v.servings ? ` · ${v.servings}` : ""}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold">{formatPrice(v.priceCents)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {settings.ordering.deliveryEnabled && zones.length > 0 && (
        <section className="mt-16">
          <h2 className="section-title">Recogida y entrega en {b.city}</h2>
          <p className="mt-3 max-w-3xl text-cocoa-700">
            Puedes recoger tu pedido en nuestro obrador o recibirlo en casa en{" "}
            {zones.map((z, i) => (
              <span key={z.id}>
                {i > 0 && (i === zones.length - 1 ? " y " : ", ")}
                {z.description.length >= MIN_ZONE_TEXT ? (
                  <Link href={`/zonas/${z.slug}`} className="font-medium text-blush-700 underline underline-offset-2">
                    {z.name}
                  </Link>
                ) : (
                  z.name
                )}
              </span>
            ))}
            .
          </p>
        </section>
      )}

      <section className="mt-16">
        <h2 className="section-title">Dónde estamos</h2>
        <div className="mt-8">
          <LocationBlock business={b} schedule={schedule} />
        </div>
      </section>

      <Faq items={faqs} />

      <nav aria-label="Más información" className="mt-16 rounded-3xl bg-cream-50 p-6">
        <p className="eyebrow mb-3">También te puede interesar</p>
        <ul className="flex flex-wrap gap-2">
          {others.map((l) => (
            <li key={l.slug}>
              <Link href={`/${l.slug}`} className="chip">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
