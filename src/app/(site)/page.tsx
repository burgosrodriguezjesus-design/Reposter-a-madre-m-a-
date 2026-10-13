import Link from "next/link";
import { ArrowRight, CalendarCheck, ChefHat, Leaf, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { ProductCard } from "@/components/site/ProductCard";
import { ReviewCard } from "@/components/site/ReviewCard";
import { LocationBlock } from "@/components/site/LocationBlock";
import { DemoBadge, SectionHeading, SmartImage, Stars } from "@/components/site/ui";
import { getActivePromotions, getApprovedReviews, getBestsellers, getCategories, getNewProducts, getReviewStats } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { getOpeningSchedule } from "@/lib/schedule";

export const revalidate = 300;

export default async function HomePage() {
  const [settings, bestsellers, categories, newProducts, promotions, reviews, stats, schedule] = await Promise.all([
    getSettings(),
    getBestsellers(4),
    getCategories(),
    getNewProducts(4),
    getActivePromotions(),
    getApprovedReviews(6),
    getReviewStats(),
    getOpeningSchedule(),
  ]);
  const b = settings.business;
  const heroSrc = b.heroImageUrl || "/demo/hero-tarta-zanahoria.svg";
  const heroAlt = b.heroImageAlt || "Tarta de zanahoria con cobertura de queso vista desde arriba, con una porción servida";
  const heroIsIllustration = heroSrc.endsWith(".svg");

  return (
    <>
      {/* ───────── Portada ───────── */}
      <section className="relative overflow-hidden">
        {/* Ramas secas decorativas (ilustración propia, sin peticiones externas) */}
        <SmartImage src="/decor/ramas-esquina.svg" alt="" aria-hidden width={520} height={520} className="pointer-events-none absolute -top-10 -left-16 w-[300px] opacity-90 select-none sm:w-[380px] lg:w-[460px]" />
        <SmartImage src="/decor/ramas-lateral.svg" alt="" aria-hidden width={260} height={300} className="pointer-events-none absolute top-1/3 right-0 hidden w-[170px] opacity-80 select-none lg:block" />
        <div className="container-page relative grid items-center gap-6 pt-6 pb-14 sm:pb-16 lg:min-h-[640px] lg:grid-cols-[1.08fr_1fr] lg:gap-10 lg:py-10">
          <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[460px] lg:-ml-6 lg:max-w-[600px]">
            <div className="relative aspect-square">
              <SmartImage
                src={heroSrc}
                alt={heroAlt}
                fill
                preload
                sizes="(min-width: 1024px) 600px, 92vw"
                className={heroIsIllustration ? "object-contain" : "object-cover shadow-lift"}
              />
            </div>
          </div>
          <div className="animate-fade-up text-center lg:pr-8">
            <h1>
              <span className="mx-auto block max-w-md font-script text-[2.1rem] leading-[1.15] font-normal text-balance text-gold-600 sm:text-[2.5rem]">{b.tagline}</span>
              <span className="mt-3 block font-sans text-[2rem] leading-[1.15] font-semibold tracking-[0.16em] text-cocoa-900 uppercase sm:text-5xl lg:text-[3.3rem]">
                {b.name}
              </span>
            </h1>
            <div className="divider-dot my-7" aria-hidden />
            <p className="lead-serif mx-auto max-w-lg">
              Tartas personalizadas, de cumpleaños, cupcakes y postres elaborados a mano cada día en nuestro obrador
              {b.neighborhood ? ` de ${b.neighborhood}` : ""}. Encarga online y recoge en tienda o recíbelo en casa.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/productos" className="btn-primary w-full sm:w-auto">
                Hacer pedido
              </Link>
              <Link href="/personalizar-tarta" className="btn-outline w-full sm:w-auto">
                Personalizar tarta
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[10.5px] font-semibold tracking-[0.2em] text-cocoa-600 uppercase">
              {stats.count > 0 && (
                <span className="flex items-center gap-2">
                  <Stars rating={stats.average} />
                  <span>
                    {stats.average.toFixed(1)} · {stats.count} {stats.count === 1 ? "opinión" : "opiniones"}
                  </span>
                </span>
              )}
              <span className="flex items-center gap-2">
                <CalendarCheck className="size-3.5 text-gold-600" /> Reserva desde {settings.ordering.minLeadHours} h
              </span>
              <span className="flex items-center gap-2">
                <Truck className="size-3.5 text-gold-600" /> Recogida o envío
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Ventajas ───────── */}
      <section aria-label="Por qué elegirnos" className="border-y border-cocoa-900/[0.06] bg-cream-50">
        <div className="container-page grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
          {[
            { icon: ChefHat, title: "Hecho a mano", text: "Cada día en nuestro obrador" },
            { icon: Leaf, title: "Ingredientes reales", text: "Mantequilla, huevos camperos y fruta fresca" },
            { icon: Truck, title: "Recogida o domicilio", text: "Tú eliges día y hora" },
            { icon: ShieldCheck, title: "Pago seguro", text: "Online o al recoger en tienda" },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-gold-400/70 text-gold-600">
                <item.icon className="size-[18px]" strokeWidth={1.5} />
              </span>
              <span>
                <strong className="block text-[11px] font-semibold tracking-[0.2em] text-cocoa-900 uppercase">{item.title}</strong>
                <span className="font-display text-[15px] text-cocoa-600 italic">{item.text}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── Más vendidos ───────── */}
      {bestsellers.length > 0 && (
        <section className="container-page py-20">
          <SectionHeading
            eyebrow="Los favoritos"
            title="Nuestros más vendidos"
            text="Las recetas que más se repiten en nuestras agendas de pedidos. Elige tamaño, añade tu dedicatoria y reserva el día."
          />
          <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {bestsellers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/productos" className="btn-outline">
              Ver todo el catálogo <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* ───────── Categorías ───────── */}
      <section className="bg-cream-50 py-20">
        <div className="container-page">
          <SectionHeading eyebrow="Para cada ocasión" title="¿Qué te apetece hoy?" />
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/categoria/${c.slug}`}
                className="group reveal relative flex items-center gap-4 overflow-hidden rounded-3xl border border-sand-300/60 bg-white p-3 pr-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-cream-200 sm:size-20">
                  {c.imageUrl && <SmartImage src={c.imageUrl} alt="" fill sizes="80px" className="object-cover" />}
                </span>
                <span className="min-w-0">
                  <strong className="block font-display text-base leading-tight text-cocoa-900 sm:text-lg">{c.name}</strong>
                  <span className="hidden text-sm text-cocoa-500 sm:line-clamp-1">{c.description}</span>
                  <span className="text-xs text-gold-700">{c._count.products} productos</span>
                </span>
                {c.isDemo && <DemoBadge className="absolute top-2 right-2 hidden sm:inline-flex" />}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Personalizador ───────── */}
      {settings.builder.enabled && (
        <section className="container-page py-20">
          <div className="reveal relative overflow-hidden rounded-sm bg-cocoa-800 px-6 py-12 text-cream-50 sm:px-12 lg:grid lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-10 lg:py-16">
            <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-blush-500/30 blur-3xl" aria-hidden />
            <div className="relative">
              <p className="eyebrow mb-3 text-gold-300">Personalizador de tartas</p>
              <h2 className="font-display text-3xl leading-tight sm:text-4xl">Diseña la tarta de tus sueños y conoce el precio al momento</h2>
              <p className="mt-4 max-w-lg text-cream-200/90">
                Tamaño, bizcocho, relleno, cobertura, colores, decoración y mensaje. ¿Algo muy especial? Pide presupuesto y te
                respondemos en menos de 24 h laborables.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/personalizar-tarta" className="btn-primary">
                  <Sparkles className="size-4" /> Empezar a diseñar
                </Link>
                <Link href="/categoria/tartas-personalizadas" className="btn border border-cream-50/30 text-cream-50 hover:bg-cream-50/10">
                  Ver ideas
                </Link>
              </div>
            </div>
            <div className="relative mt-10 grid grid-cols-3 gap-3 lg:mt-0">
              {["/demo/tarta-personalizada-nombre.svg", "/demo/naked-cake-flores.svg", "/demo/tarta-cumpleanos-velas.svg"].map((src, i) => (
                <div key={src} className={`relative aspect-[3/4] overflow-hidden rounded-3xl border-2 border-cream-50/20 ${i === 1 ? "translate-y-6" : ""}`}>
                  <SmartImage src={src} alt="" fill sizes="180px" className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Promociones ───────── */}
      {promotions.length > 0 && (
        <section className="container-page pb-20">
          <SectionHeading eyebrow="Promociones" title="Ofertas y especiales" />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {promotions.map((promo) => (
              <article key={promo.id} className="reveal card relative flex overflow-hidden">
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="flex gap-2">
                    {promo.badge && <span className="badge bg-gold-200 text-gold-700">{promo.badge}</span>}
                    {promo.isDemo && <DemoBadge />}
                  </div>
                  <h3 className="mt-3 font-display text-2xl text-cocoa-900">{promo.title}</h3>
                  <p className="mt-2 text-cocoa-600">{promo.description}</p>
                  {promo.ctaHref && (
                    <Link href={promo.ctaHref} className="btn-primary btn-sm mt-6 self-start">
                      {promo.ctaLabel || "Ver más"} <ArrowRight className="size-4" />
                    </Link>
                  )}
                </div>
                {promo.imageUrl && (
                  <div className="relative hidden w-40 shrink-0 sm:block">
                    <SmartImage src={promo.imageUrl} alt="" fill sizes="160px" className="object-cover" />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ───────── Novedades ───────── */}
      {newProducts.length > 0 && (
        <section className="bg-blush-50 py-20">
          <div className="container-page">
            <SectionHeading eyebrow="Recién salidos del horno" title="Novedades y temporada" />
            <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {newProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────── Elaboración artesanal ───────── */}
      <section className="container-page py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal relative aspect-[3/2] overflow-hidden rounded-sm border-4 border-white shadow-lift">
            <SmartImage
              src={b.storePhotos[0]?.url || "/demo/obrador.svg"}
              alt={b.storePhotos[0]?.alt || `Fachada y escaparate de ${b.name}`}
              fill
              sizes="(min-width: 1024px) 600px, 92vw"
              className="object-cover"
            />
          </div>
          <div>
            <SectionHeading align="left" eyebrow="Así trabajamos" title="Repostería de verdad, sin atajos" />
            <ol className="space-y-6">
              {[
                { t: "Ingredientes de primera", d: "Mantequilla, nata fresca, huevos camperos, chocolate de cobertura y fruta de temporada de proveedores cercanos." },
                { t: "Horneado por encargo", d: "Planificamos el obrador con tus pedidos: cada tarta se hornea entre 24 y 48 h antes de su entrega." },
                { t: "Decorado a mano", d: "Cremas, goteos, flores y letras se hacen a mano, pieza a pieza. Ninguna tarta sale igual que otra." },
              ].map((step, i) => (
                <li key={step.t} className="reveal flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold-400 font-display text-lg text-gold-700">
                    {i + 1}
                  </span>
                  <span>
                    <strong className="block text-lg text-cocoa-900">{step.t}</strong>
                    <span className="text-cocoa-600">{step.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───────── Opiniones ───────── */}
      <section className="bg-cream-50 py-20">
        <div className="container-page">
          <SectionHeading
            eyebrow="Opiniones de clientes"
            title="Lo que dicen de nosotros"
            text={stats.count ? `Valoración media de ${stats.average.toFixed(1)} sobre 5 en ${stats.count} opiniones de clientes.` : undefined}
          />
          {reviews.length > 0 ? (
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          ) : (
            <p className="mt-8 text-center text-cocoa-600">Todavía no hay opiniones publicadas. ¡La tuya puede ser la primera!</p>
          )}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/opiniones" className="btn-outline">
              Ver todas y dejar la mía
            </Link>
            {b.googleReviewUrl && (
              <a href={b.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                Opinar en Google
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ───────── Ubicación ───────── */}
      <section className="container-page py-20" id="ubicacion">
        <SectionHeading eyebrow="Dónde estamos" title={`Visítanos en ${b.neighborhood || b.city}`} />
        <div className="mt-12">
          <LocationBlock business={b} schedule={schedule} />
        </div>
      </section>

      {/* ───────── Llamada final ───────── */}
      <section className="container-page">
        <div className="reveal rounded-sm bg-gradient-to-br from-blush-200 via-blush-100 to-gold-200 px-6 py-14 text-center sm:px-12">
          <h2 className="section-title">¿Tienes algo que celebrar?</h2>
          <p className="mx-auto mt-3 max-w-xl text-cocoa-700">
            Reserva hoy tu tarta y olvídate de preocupaciones. Te confirmamos el pedido por email y puedes seguirlo en todo momento.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/productos" className="btn-primary px-8">
              Hacer pedido
            </Link>
            <Link href="/personalizar-tarta" className="btn-outline">
              Personalizar tarta
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
