import type { Metadata } from "next";
import { Breadcrumbs, Stars } from "@/components/site/ui";
import { ReviewCard } from "@/components/site/ReviewCard";
import { ReviewForm } from "@/components/site/ReviewForm";
import { getApprovedReviews, getReviewStats } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getSettings();
  return {
    title: "Opiniones de clientes",
    description: `Opiniones reales de clientes de ${business.name} en ${business.city}. Cuéntanos qué te pareció tu tarta.`,
    alternates: { canonical: "/opiniones" },
  };
}

export default async function ReviewsPage({ searchParams }: PageProps<"/opiniones">) {
  const [reviews, stats, settings, params] = await Promise.all([getApprovedReviews(60), getReviewStats(), getSettings(), searchParams]);
  const orderNumber = typeof params.pedido === "string" ? params.pedido.slice(0, 20) : undefined;

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: "Opiniones", path: "/opiniones" }]} />
      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Opiniones de clientes</h1>
          <p className="mt-3 max-w-2xl text-lg text-cocoa-600">
            Publicamos las opiniones tal y como nos llegan, después de comprobar que no contienen datos personales ni lenguaje ofensivo.
          </p>
        </div>
        {stats.count > 0 && (
          <div className="card flex items-center gap-4 px-5 py-4">
            <span className="font-display text-4xl text-cocoa-900">{stats.average.toFixed(1)}</span>
            <span>
              <Stars rating={stats.average} />
              <span className="block text-sm text-cocoa-500">{stats.count} opiniones</span>
            </span>
          </div>
        )}
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_420px]">
        <div className="grid h-fit gap-5 sm:grid-cols-2">
          {reviews.length ? (
            reviews.map((r) => <ReviewCard key={r.id} review={r} />)
          ) : (
            <p className="text-cocoa-600">Aún no hay opiniones publicadas.</p>
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <ReviewForm orderNumber={orderNumber} />
          {settings.business.googleReviewUrl && (
            <a href={settings.business.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn-outline w-full">
              También puedes opinar en Google
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
