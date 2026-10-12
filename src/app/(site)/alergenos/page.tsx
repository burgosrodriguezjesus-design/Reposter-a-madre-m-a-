import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/ui";
import { getProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { ALLERGENS } from "@/lib/allergens";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Información sobre alérgenos",
  description: "Tabla de alérgenos de todos nuestros productos según el Reglamento (UE) 1169/2011.",
  alternates: { canonical: "/alergenos" },
};

export default async function AllergensPage() {
  const [products, settings] = await Promise.all([getProducts({ sort: "popular" }), getSettings()]);
  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: "Alérgenos", path: "/alergenos" }]} />
      <h1 className="mt-6 font-display text-4xl text-cocoa-900 sm:text-5xl">Información sobre alérgenos</h1>
      <div className="prose-content mt-5 max-w-3xl">
        <p>
          Indicamos la presencia de los 14 alérgenos de declaración obligatoria según el Reglamento (UE) 1169/2011 y el Real Decreto
          126/2015. Las recetas personalizadas pueden variar: revisa siempre la ficha de cada producto y consúltanos ante cualquier duda.
        </p>
        <p>
          <strong>{settings.ordering.allergenNotice}</strong>
        </p>
      </div>
      <div className="mt-8 overflow-x-auto rounded-3xl border border-sand-300/60 bg-white shadow-soft">
        <table className="w-full min-w-[900px] text-sm">
          <caption className="sr-only">Tabla de alérgenos por producto. ● contiene, ○ puede contener trazas</caption>
          <thead className="bg-cream-100">
            <tr>
              <th scope="col" className="sticky left-0 bg-cream-100 px-4 py-3 text-left font-semibold">
                Producto
              </th>
              {ALLERGENS.map((a) => (
                <th key={a.key} scope="col" className="px-2 py-3 text-center text-xs font-semibold text-cocoa-600">
                  <span className="block text-base" aria-hidden>
                    {a.emoji}
                  </span>
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-300/50">
            {products.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="sticky left-0 bg-white px-4 py-2.5 text-left font-medium">
                  <Link href={`/producto/${p.slug}`} className="hover:text-blush-700">
                    {p.name}
                  </Link>
                </th>
                {ALLERGENS.map((a) => (
                  <td key={a.key} className="px-2 py-2.5 text-center">
                    {p.allergens.includes(a.key) ? (
                      <span className="text-blush-700" title="Contiene">
                        ●
                      </span>
                    ) : p.mayContain.includes(a.key) ? (
                      <span className="text-cocoa-500" title="Puede contener trazas">
                        ○
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-cocoa-500">● Contiene · ○ Puede contener trazas</p>
    </div>
  );
}
