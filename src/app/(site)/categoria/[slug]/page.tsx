import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Palette } from "lucide-react";
import { ProductCard } from "@/components/site/ProductCard";
import { Breadcrumbs, Paragraphs } from "@/components/site/ui";
import { db } from "@/lib/db";
import { getProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { cache } from "react";

export const revalidate = 300;

/** Sin páginas en la compilación: cada una se genera en su primera visita y queda en caché (ISR). */
export async function generateStaticParams() {
  return [];
}

const getCategory = cache((slug: string) => db.category.findFirst({ where: { slug, active: true } }));

export async function generateMetadata({ params }: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [category, { business }] = await Promise.all([getCategory(slug), getSettings()]);
  if (!category) return {};
  return {
    title: category.seoTitle || `${category.name} en ${business.city}`,
    description:
      category.seoDescription ||
      `${category.name} artesanales de ${business.name} en ${business.city}. ${category.description} Encarga online y recógelo en tienda.`,
    alternates: { canonical: `/categoria/${category.slug}` },
    openGraph: category.imageUrl && !category.imageUrl.endsWith(".svg") ? { images: [category.imageUrl] } : undefined,
  };
}

export default async function CategoryPage({ params }: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  const [products, settings] = await Promise.all([getProducts({ category: slug }), getSettings()]);

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs
        items={[
          { name: "Productos", path: "/productos" },
          { name: category.name, path: `/categoria/${category.slug}` },
        ]}
      />
      <header className="mt-6 max-w-3xl">
        <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">
          {category.name} <span className="text-cocoa-500">en {settings.business.city}</span>
        </h1>
        {category.description && <p className="mt-3 text-lg text-cocoa-600">{category.description}</p>}
      </header>

      {products.length > 0 ? (
        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} priority={i < 2} />
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-3xl border border-dashed border-sand-400 p-10 text-center text-cocoa-600">
          Pronto añadiremos productos a esta categoría. Mientras tanto, puedes{" "}
          <Link href="/personalizar-tarta" className="font-semibold text-blush-700 underline">
            diseñar tu propia tarta
          </Link>
          .
        </p>
      )}

      {category.content && (
        <section className="mt-16 grid gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <h2 className="font-display text-3xl text-cocoa-900">Más sobre {category.name.toLowerCase()}</h2>
            <Paragraphs text={category.content} className="mt-4" />
          </div>
          {settings.builder.enabled && (
            <aside className="card h-fit p-6">
              <p className="font-display text-xl text-cocoa-900">¿Buscas algo diferente?</p>
              <p className="mt-2 text-sm text-cocoa-600">Diseña tu tarta paso a paso y conoce el precio al momento.</p>
              <Link href="/personalizar-tarta" className="btn-primary btn-sm mt-4">
                <Palette className="size-4" /> Personalizar tarta
              </Link>
            </aside>
          )}
        </section>
      )}
    </div>
  );
}
