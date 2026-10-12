import type { Metadata } from "next";
import Link from "next/link";
import { Car, Mail, Truck } from "lucide-react";
import { Breadcrumbs, SmartImage } from "@/components/site/ui";
import { LocationBlock } from "@/components/site/LocationBlock";
import { getSettings } from "@/lib/settings";
import { getOpeningSchedule } from "@/lib/schedule";
import { getDeliveryZones, MIN_ZONE_TEXT } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { business: b } = await getSettings();
  return {
    title: `Dónde estamos: ${b.name} en ${b.neighborhood ? `${b.neighborhood}, ` : ""}${b.city}`,
    description: `Dirección, horario, teléfono y cómo llegar a ${b.name}: ${b.street}, ${b.postalCode} ${b.city}. Zonas de entrega a domicilio y recogida en tienda.`,
    alternates: { canonical: "/donde-estamos" },
  };
}

export default async function LocationPage() {
  const [settings, schedule, zones] = await Promise.all([getSettings(), getOpeningSchedule(), getDeliveryZones()]);
  const b = settings.business;
  const photos = b.storePhotos.length ? b.storePhotos : [{ url: "/demo/obrador.svg", alt: `Fachada de ${b.name}` }];

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: "Dónde estamos", path: "/donde-estamos" }]} />
      <header className="mt-6 max-w-3xl">
        <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Dónde estamos</h1>
        <p className="mt-3 text-lg text-cocoa-600">
          Nuestro obrador y tienda están en {b.neighborhood ? `el barrio de ${b.neighborhood}, en ` : ""}
          {b.city}. Ven a recoger tu pedido a la hora que elijas o te lo llevamos a casa.
        </p>
      </header>

      <div className="mt-10">
        <LocationBlock business={b} schedule={schedule} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-display text-2xl text-cocoa-900">
            <Car className="size-5 text-gold-600" /> Cómo llegar
          </h2>
          <p className="mt-3 leading-relaxed text-cocoa-700">{b.howToGetThere}</p>
        </section>
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl text-cocoa-900">
            <Mail className="size-5 text-gold-600" /> Contacto
          </h2>
          <ul className="mt-3 space-y-1.5 text-cocoa-700">
            <li>Teléfono: {b.phone}</li>
            {b.whatsapp && <li>WhatsApp: {b.whatsapp}</li>}
            {b.email && <li>Email: {b.email}</li>}
          </ul>
        </section>
      </div>

      {settings.ordering.deliveryEnabled && zones.length > 0 && (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 font-display text-3xl text-cocoa-900">
            <Truck className="size-6 text-gold-600" /> Zonas de entrega a domicilio
          </h2>
          <p className="mt-2 text-cocoa-600">{settings.ordering.deliveryInfo}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map((z) => (
              <article key={z.id} className="card p-5">
                <h3 className="font-display text-xl text-cocoa-900">
                  {z.description.length >= MIN_ZONE_TEXT ? (
                    <Link href={`/zonas/${z.slug}`} className="hover:text-blush-700">
                      {z.name}
                    </Link>
                  ) : (
                    z.name
                  )}
                </h3>
                <p className="mt-1 text-sm text-cocoa-500">CP: {z.postalCodes.join(", ")}</p>
                <ul className="mt-3 space-y-1 text-sm text-cocoa-700">
                  <li>Envío: {z.feeCents ? formatPrice(z.feeCents) : "gratis"}</li>
                  {z.minOrderCents > 0 && <li>Pedido mínimo: {formatPrice(z.minOrderCents)}</li>}
                  {z.freeFromCents != null && <li>Gratis desde {formatPrice(z.freeFromCents)}</li>}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-3xl text-cocoa-900">Nuestro obrador</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p) => (
            <div key={p.url} className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-sand-300/60 bg-cream-200">
              <SmartImage src={p.url} alt={p.alt} fill sizes="(min-width: 1024px) 400px, 92vw" className="object-cover" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
