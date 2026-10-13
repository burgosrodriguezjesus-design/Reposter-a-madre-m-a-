import type { Metadata } from "next";
import Link from "next/link";
import { CakeBuilder } from "@/components/site/builder/CakeBuilder";
import { Breadcrumbs } from "@/components/site/ui";
import { getSettings } from "@/lib/settings";
import { metaDescription } from "@/lib/format";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getSettings();
  return {
    title: `Diseña tu tarta personalizada en ${business.city}`,
    description: metaDescription(`Diseña tu tarta en ${business.name}: tamaño, bizcocho, relleno, cobertura, colores y mensaje, con el precio al momento. Presupuesto para diseños especiales.`),
    alternates: { canonical: "/personalizar-tarta" },
  };
}

export default async function BuilderPage() {
  const settings = await getSettings();
  const { builder } = settings;
  const lead = Math.max(builder.leadTimeHours, settings.ordering.minLeadHours);

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: "Personalizar tarta", path: "/personalizar-tarta" }]} />
      <header className="mt-6 max-w-3xl">
        <p className="eyebrow">Personalizador</p>
        <h1 className="mt-2 font-display text-4xl text-cocoa-900 sm:text-5xl">Diseña tu tarta personalizada</h1>
        <p className="mt-3 text-lg text-cocoa-600">{builder.intro}</p>
      </header>
      <div className="mt-10">
        {builder.enabled ? (
          <CakeBuilder builder={builder} quoteLeadHours={lead} deliveryEnabled={settings.ordering.deliveryEnabled} />
        ) : (
          <p className="rounded-3xl bg-white p-8 text-cocoa-700 shadow-soft">
            El personalizador no está disponible en este momento. Echa un vistazo a nuestras{" "}
            <Link href="/categoria/tartas-personalizadas" className="font-semibold text-blush-700 underline">
              tartas personalizadas
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
