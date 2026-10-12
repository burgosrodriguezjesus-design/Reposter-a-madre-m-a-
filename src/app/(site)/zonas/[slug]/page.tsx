import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getBestsellers, MIN_ZONE_TEXT } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { ProductCard } from "@/components/site/ProductCard";
import { Breadcrumbs, Paragraphs } from "@/components/site/ui";

export const revalidate = 600;

/** Sin páginas en la compilación: cada una se genera en su primera visita y queda en caché (ISR). */
export async function generateStaticParams() {
  return [];
}

const getZone = cache(async (slug: string) => {
  const zone = await db.deliveryZone.findUnique({ where: { slug } });
  return zone && zone.active && zone.description.trim().length >= MIN_ZONE_TEXT ? zone : null;
});

export async function generateMetadata({ params }: PageProps<"/zonas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [zone, { business }] = await Promise.all([getZone(slug), getSettings()]);
  if (!zone) return {};
  return {
    title: `Tartas a domicilio en ${zone.name} (${business.city})`,
    description: `Entrega de tartas y dulces artesanales en ${zone.name}: códigos postales ${zone.postalCodes.join(", ")}, envío ${zone.feeCents ? `desde ${formatPrice(zone.feeCents)}` : "gratis"}. Encarga online en ${business.name}.`,
    alternates: { canonical: `/zonas/${zone.slug}` },
  };
}

export default async function ZonePage({ params }: PageProps<"/zonas/[slug]">) {
  const { slug } = await params;
  const zone = await getZone(slug);
  if (!zone) notFound();
  const [settings, products] = await Promise.all([getSettings(), getBestsellers(4)]);

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs
        items={[
          { name: "Dónde estamos", path: "/donde-estamos" },
          { name: zone.name, path: `/zonas/${zone.slug}` },
        ]}
      />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">
            Tartas a domicilio en {zone.name}
          </h1>
          <Paragraphs text={zone.description} className="mt-5 text-[17px]" />
        </div>
        <aside className="card h-fit p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl text-cocoa-900">
            <Truck className="size-5 text-gold-600" /> Condiciones de entrega
          </h2>
          <ul className="mt-4 space-y-2 text-cocoa-700">
            <li>Códigos postales: {zone.postalCodes.join(", ")}</li>
            <li>Envío: {zone.feeCents ? formatPrice(zone.feeCents) : "gratis"}</li>
            {zone.minOrderCents > 0 && <li>Pedido mínimo: {formatPrice(zone.minOrderCents)}</li>}
            {zone.freeFromCents != null && <li>Envío gratis desde {formatPrice(zone.freeFromCents)}</li>}
          </ul>
          <p className="mt-4 text-sm text-cocoa-500">{settings.ordering.deliveryInfo}</p>
          <Link href="/productos" className="btn-primary mt-6 w-full">
            Hacer pedido
          </Link>
        </aside>
      </div>
      {products.length > 0 && (
        <section className="mt-16">
          <h2 className="section-title">Lo más pedido en {zone.name}</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
