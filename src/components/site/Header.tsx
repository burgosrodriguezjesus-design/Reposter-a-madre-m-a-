import Link from "next/link";
import { BrandMark } from "@/components/icons";
import { CartButton } from "@/components/site/CartButton";
import { MobileMenu } from "@/components/site/MobileMenu";
import { getCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export const NAV_LINKS = [
  { href: "/productos", label: "Productos" },
  { href: "/personalizar-tarta", label: "Personalizar tarta" },
  { href: "/tarjetas-regalo", label: "Tarjetas regalo" },
  { href: "/opiniones", label: "Opiniones" },
  { href: "/donde-estamos", label: "Dónde estamos" },
];

export async function Header() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const { business } = settings;

  return (
    <header className="sticky top-0 z-40 border-b border-sand-300/50 bg-cream-100/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-20">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${business.name}, ir al inicio`}>
          <BrandMark className="size-9 lg:size-11" />
          <span className="leading-tight">
            <span className="block font-display text-lg italic text-cocoa-900 lg:text-xl">{business.name}</span>
            <span className="hidden text-[11px] tracking-[0.18em] text-gold-700 uppercase sm:block">
              Repostería artesanal · {business.city}
            </span>
          </span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[15px] font-medium text-cocoa-700 transition hover:bg-white hover:text-cocoa-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
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
