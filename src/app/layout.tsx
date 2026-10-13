import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Great_Vibes, Montserrat } from "next/font/google";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";
import "@/lib/taint";

// Se descargan al compilar y se sirven desde el propio dominio (sin peticiones a Google al navegar)
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400", variable: "--font-great-vibes", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { business, seo } = await getSettings();
  const title = seo.homeTitle || `${business.name} · Repostería artesanal en ${business.city}`;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: `%s | ${business.name}` },
    description: seo.homeDescription || business.description,
    applicationName: business.name,
    openGraph: {
      type: "website",
      locale: "es_ES",
      siteName: business.name,
      images: [{ url: business.heroImageUrl || "/brand/og.jpg", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
    verification: seo.googleSiteVerification ? { google: seo.googleSiteVerification } : undefined,
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#F6F0EB",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${cormorant.variable} ${greatVibes.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
