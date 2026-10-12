/** URL pública absoluta del sitio (sin barra final). */
export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Convierte rutas relativas (/uploads/..., /demo/...) en absolutas para emails y datos estructurados. */
export function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : siteUrl(url);
}
