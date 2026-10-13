import type { NextConfig } from "next";

// Solo se fuerza HTTPS cuando el sitio público usa https (permite probar en local con http)
const isHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
const supabaseHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;

/**
 * Cabeceras de seguridad comunes. La Content-Security-Policy se genera en src/proxy.ts
 * (con nonce en las páginas con datos personales o credenciales).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // "preload" (listas de los navegadores) es casi irreversible: solo con HSTS_PRELOAD=true, cuando
  // TODOS los subdominios sirvan HTTPS (igual que infra/cloudflare/zone-settings.json)
  ...(isHttps ? [{ key: "Strict-Transport-Security", value: `max-age=63072000; includeSubDomains${process.env.HSTS_PRELOAD === "true" ? "; preload" : ""}` }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Imagen mínima para Docker/Kubernetes (Vercel lo ignora)
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 85],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  experimental: {
    // Impide pasar secretos marcados (src/lib/taint.ts) a Componentes de Cliente
    taint: true,
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Las respuestas de la API son datos, nunca documentos ejecutables
      { source: "/api/(.*)", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
      { source: "/demo/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
