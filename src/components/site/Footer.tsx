import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { BrandMark, FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/icons";
import { OpeningHours } from "@/components/site/OpeningHours";
import { CookieSettingsLink } from "@/components/site/CookieConsent";
import { getCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { getOpeningSchedule } from "@/lib/schedule";
import { telLink, whatsappLink } from "@/lib/format";
import { getLandings } from "@/content/landings";

export async function Footer() {
  const [settings, categories, schedule] = await Promise.all([getSettings(), getCategories(), getOpeningSchedule()]);
  const b = settings.business;
  const landings = getLandings(b);

  return (
    <footer className="mt-24 border-t border-sand-300/60 bg-cream-50">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark className="size-20" />
            <span className="font-display text-xl italic text-cocoa-900">{b.name}</span>
          </Link>
          <p className="text-sm leading-relaxed text-cocoa-600">{b.description}</p>
          <div className="flex gap-2">
            {b.instagram && (
              <a href={b.instagram} target="_blank" rel="noopener noreferrer" className="btn-ghost size-11 p-0" aria-label="Instagram">
                <InstagramIcon />
              </a>
            )}
            {b.facebook && (
              <a href={b.facebook} target="_blank" rel="noopener noreferrer" className="btn-ghost size-11 p-0" aria-label="Facebook">
                <FacebookIcon />
              </a>
            )}
            {b.tiktok && (
              <a href={b.tiktok} target="_blank" rel="noopener noreferrer" className="btn-ghost size-11 p-0" aria-label="TikTok">
                <TikTokIcon />
              </a>
            )}
            {b.whatsapp && (
              <a href={whatsappLink(b.whatsapp)} target="_blank" rel="noopener noreferrer" className="btn-ghost size-11 p-0" aria-label="WhatsApp">
                <WhatsAppIcon />
              </a>
            )}
          </div>
        </div>

        <div>
          <h2 className="kicker mb-4">Visítanos</h2>
          <address className="space-y-3 text-sm not-italic text-cocoa-700">
            <p className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" />
              <span>
                {b.street}
                <br />
                {b.postalCode} {b.city}
              </span>
            </p>
            <p>
              <a href={telLink(b.phone)} className="flex gap-2.5 hover:text-blush-700">
                <Phone className="mt-0.5 size-4 shrink-0 text-gold-600" /> {b.phone}
              </a>
            </p>
            {b.email && (
              <p>
                <a href={`mailto:${b.email}`} className="flex gap-2.5 hover:text-blush-700">
                  <Mail className="mt-0.5 size-4 shrink-0 text-gold-600" /> {b.email}
                </a>
              </p>
            )}
          </address>
          <div className="mt-5">
            <OpeningHours schedule={schedule} compact />
          </div>
        </div>

        <div>
          <h2 className="kicker mb-4">Productos</h2>
          <ul className="space-y-2 text-sm text-cocoa-700">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/categoria/${c.slug}`} className="hover:text-blush-700">
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/personalizar-tarta" className="hover:text-blush-700">
                Diseña tu tarta
              </Link>
            </li>
            <li>
              <Link href="/tarjetas-regalo" className="hover:text-blush-700">
                Tarjetas regalo
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="kicker mb-4">En {b.city}</h2>
          <ul className="space-y-2 text-sm text-cocoa-700">
            {landings.map((l) => (
              <li key={l.slug}>
                <Link href={`/${l.slug}`} className="hover:text-blush-700">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/seguimiento" className="hover:text-blush-700">
                Seguir mi pedido
              </Link>
            </li>
            {settings.marketing.remindersEnabled && (
              <li>
                <Link href="/recordatorios" className="hover:text-blush-700">
                  Recordatorios de celebraciones
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-sand-300/60">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-cocoa-500 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {b.name}. Elaborado artesanalmente en {b.city}.
          </p>
          <nav aria-label="Información legal" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/aviso-legal" className="hover:text-cocoa-800">Aviso legal</Link>
            <Link href="/privacidad" className="hover:text-cocoa-800">Privacidad</Link>
            <Link href="/cookies" className="hover:text-cocoa-800">Cookies</Link>
            <Link href="/condiciones-de-compra" className="hover:text-cocoa-800">Condiciones de compra</Link>
            <Link href="/cancelaciones" className="hover:text-cocoa-800">Cancelaciones</Link>
            <Link href="/alergenos" className="hover:text-cocoa-800">Alérgenos</Link>
            <CookieSettingsLink />
          </nav>
        </div>
      </div>
    </footer>
  );
}
