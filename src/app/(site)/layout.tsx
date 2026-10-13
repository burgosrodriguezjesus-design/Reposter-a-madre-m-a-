import Link from "next/link";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { CookieConsent } from "@/components/site/CookieConsent";
import { WhatsAppIcon } from "@/components/icons";
import { JsonLd } from "@/components/site/JsonLd";
import { getSettings } from "@/lib/settings";
import { hasDemoContent } from "@/lib/catalog";
import { getOpeningSchedule } from "@/lib/schedule";
import { bakerySchema } from "@/lib/structured-data";
import { whatsappLink } from "@/lib/format";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, demo, schedule] = await Promise.all([getSettings(), hasDemoContent(), getOpeningSchedule()]);
  const { business, marketing, seo } = settings;

  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Saltar al contenido
      </a>
      {demo && marketing.showDemoBanner && (
        <div className="bg-cocoa-900 px-4 py-2 text-center text-xs text-cream-100">
          <strong className="text-gold-300">Modo demostración:</strong> los productos, precios y opiniones marcados
          como «Demo» son de ejemplo. Sustitúyelos desde el{" "}
          <Link href="/admin" className="underline">
            panel
          </Link>
          .
        </div>
      )}
      {marketing.announcement && (
        <div className="border-b border-cocoa-900/[0.06] bg-cream-50 px-4 py-2 text-center text-[10.5px] font-medium tracking-[0.2em] text-gold-700 uppercase">{marketing.announcement}</div>
      )}
      <Header />
      <main id="contenido">{children}</main>
      <Footer />
      {business.whatsapp && (
        <a
          href={whatsappLink(business.whatsapp, `¡Hola ${business.name}! Quería hacer una consulta sobre un pedido.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-4 bottom-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition hover:scale-105 sm:right-6 sm:bottom-6"
          aria-label="Escríbenos por WhatsApp"
        >
          <WhatsAppIcon className="size-7" />
        </a>
      )}
      <CookieConsent gaId={seo.gaMeasurementId} />
      <JsonLd data={bakerySchema(settings, schedule)} />
    </>
  );
}
