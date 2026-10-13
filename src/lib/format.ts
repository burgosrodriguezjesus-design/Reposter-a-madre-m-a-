const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** 3550 → "35,50 €" */
export function formatPrice(cents: number): string {
  return euro.format(cents / 100);
}

/** "35,50" | "35.5" | "35" → 3550 */
export function parsePriceToCents(value: string | number): number {
  if (typeof value === "number") return Math.round(value * 100);
  const normalized = value.replace(/\s|€/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

const longDate = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-10-12" → "lunes, 12 de octubre de 2026" (la fecha es local del negocio) */
export function formatLocalDate(isoDate: string, variant: "long" | "short" = "long"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (variant === "long" ? longDate : shortDate).format(date);
}

export function formatDateTime(date: Date, timeZone = "Europe/Madrid"): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Teléfono para enlaces wa.me: solo dígitos con prefijo internacional */
export function phoneToWhatsApp(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 9) return `34${digits}`; // número español sin prefijo
  return digits;
}

export function whatsappLink(phone: string, text?: string): string {
  const base = `https://wa.me/${phoneToWhatsApp(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Metadescripción para Google (≈155 caracteres): si el texto es más largo se corta en la última
 * palabra completa y se añade «…», en vez de que el buscador lo corte a mitad de palabra.
 */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:·-]+$/, "")}…`;
}
