/**
 * Datos estructurados Schema.org (JSON-LD) para Google:
 * Bakery (LocalBusiness), Product, BreadcrumbList y FAQPage.
 */
import type { AllSettings, BusinessSettings } from "@/lib/settings-types";
import type { OpeningSchedule } from "@/lib/schedule";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fullAddress(b: BusinessSettings) {
  return `${b.venue ? `${b.venue}, ` : ""}${b.street}, ${b.postalCode} ${b.city}${b.province && b.province !== b.city ? `, ${b.province}` : ""}`;
}

export function mapsSearchUrl(b: BusinessSettings) {
  if (b.googleBusinessUrl) return b.googleBusinessUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name}, ${fullAddress(b)}`)}`;
}

export function mapsDirectionsUrl(b: BusinessSettings) {
  const destination = b.latitude != null && b.longitude != null ? `${b.latitude},${b.longitude}` : fullAddress(b);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function mapsEmbedUrl(b: BusinessSettings) {
  const q = b.latitude != null && b.longitude != null ? `${b.latitude},${b.longitude}` : fullAddress(b);
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
}

export function bakerySchema(settings: AllSettings, schedule: OpeningSchedule, areaServed: string[] = []) {
  const b = settings.business;
  const sameAs = [b.instagram, b.facebook, b.tiktok, b.googleBusinessUrl].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Bakery",
    "@id": siteUrl("/#negocio"),
    name: b.name,
    description: b.description,
    slogan: b.tagline,
    url: siteUrl(),
    telephone: b.phone,
    email: b.email || undefined,
    image: [absoluteUrl(b.heroImageUrl || "/brand/og.jpg")],
    logo: siteUrl("/brand/logo-512.webp"),
    priceRange: b.priceRange,
    currenciesAccepted: "EUR",
    address: {
      "@type": "PostalAddress",
      streetAddress: b.venue ? `${b.street} (${b.venue})` : b.street,
      postalCode: b.postalCode,
      addressLocality: b.city,
      addressRegion: b.province,
      addressCountry: "ES",
    },
    geo:
      b.latitude != null && b.longitude != null
        ? { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude }
        : undefined,
    hasMap: mapsSearchUrl(b),
    openingHoursSpecification: schedule.flatMap((day) =>
      day.intervals.map((i) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${DAYS[day.weekday]}`,
        opens: i.opensAt,
        closes: i.closesAt,
      })),
    ),
    areaServed: areaServed.length ? areaServed.map((name) => ({ "@type": "Place", name })) : { "@type": "City", name: b.city },
    sameAs: sameAs.length ? sameAs : undefined,
    potentialAction: {
      "@type": "OrderAction",
      target: { "@type": "EntryPoint", urlTemplate: siteUrl("/productos"), actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] },
      deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
    },
  };
}

const AVAILABILITY: Record<string, string> = {
  AVAILABLE: "https://schema.org/InStock",
  ON_DEMAND: "https://schema.org/PreOrder",
  SEASONAL: "https://schema.org/LimitedAvailability",
  SOLD_OUT: "https://schema.org/OutOfStock",
};

export function productSchema(input: {
  name: string;
  slug: string;
  description: string;
  images: string[];
  priceCents: number;
  variants: { name: string; priceCents: number }[];
  availability: string;
  categoryName: string;
  brand: string;
  allergens: string[];
}) {
  const prices = input.variants.length ? input.variants.map((v) => v.priceCents) : [input.priceCents];
  const low = Math.min(...prices) / 100;
  const high = Math.max(...prices) / 100;
  const url = siteUrl(`/producto/${input.slug}`);
  const availability = AVAILABILITY[input.availability] ?? AVAILABILITY.AVAILABLE;
  const returnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "ES",
    returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
  };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#producto`,
    name: input.name,
    description: input.description,
    image: input.images.map(absoluteUrl),
    sku: input.slug,
    category: input.categoryName,
    brand: { "@type": "Brand", name: input.brand },
    additionalProperty: input.allergens.length
      ? [{ "@type": "PropertyValue", name: "Alérgenos", value: input.allergens.join(", ") }]
      : undefined,
    offers:
      prices.length > 1
        ? {
            "@type": "AggregateOffer",
            url,
            priceCurrency: "EUR",
            lowPrice: low.toFixed(2),
            highPrice: high.toFixed(2),
            offerCount: prices.length,
            availability,
          }
        : {
            "@type": "Offer",
            url,
            priceCurrency: "EUR",
            price: low.toFixed(2),
            availability,
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@id": siteUrl("/#negocio") },
            hasMerchantReturnPolicy: returnPolicy,
          },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
