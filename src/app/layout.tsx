import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";
import "@/lib/taint";

const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

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
      images: [{ url: business.heroImageUrl || "/demo/og-default.jpg", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
    verification: seo.googleSiteVerification ? { google: seo.googleSiteVerification } : undefined,
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#FBF7F2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${dmSans.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
