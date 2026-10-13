import Link from "next/link";
import { BrandMark } from "@/components/icons";
import { CartButton } from "@/components/site/CartButton";
import { MobileMenu } from "@/components/site/MobileMenu";
import { NavLinks } from "@/components/site/NavLinks";
import { getCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/productos", label: "Productos" },
  { href: "/personalizar-tarta", label: "Personalizar" },
  { href: "/tarjetas-regalo", label: "Tarjetas regalo" },
  { href: "/opiniones", label: "Opiniones" },
  { href: "/donde-estamos", label: "Contacto" },
];

export async function Header() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const { business } = settings;

  return (
    <header className="sticky top-0 z-40 border-b border-cocoa-900/[0.06] bg-cream-100/90 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-6 lg:h-[84px]">
        <Link href="/" className="flex items-center gap-3" aria-label={`${business.name}, ir al inicio`}>
          <BrandMark className="size-8 lg:size-9" />
          <span className="leading-none">
            <span className="block font-display text-xl text-cocoa-900 italic lg:text-[1.4rem]">{business.name}</span>
            <span className="mt-1 hidden text-[9px] font-semibold tracking-[0.26em] whitespace-nowrap text-gold-700 uppercase sm:block">
              Repostería artesanal · {business.city}
            </span>
          </span>
        </Link>

        <NavLinks links={NAV_LINKS} />

        <div className="flex items-center gap-1 sm:gap-3">
          <Link href="/productos" className="btn-primary btn-sm hidden sm:inline-flex">
            Hacer pedido
          </Link>
          <CartButton />
          <MobileMenu
            links={NAV_LINKS}
            categories={categories.map((c) => ({ href: `/categoria/${c.slug}`, label: c.name }))}
            phone={business.phone}
          />
        </div>
      </div>
    </header>
  );
}
