import "server-only";
import type { AllSettings } from "@/lib/settings-types";

export type SetupItem = { label: string; ok: boolean; help: string; href?: string };

/** Lista de comprobación para dejar la web lista para producción. */
export function setupChecklist(settings: AllSettings, hasDemo: boolean): SetupItem[] {
  const b = settings.business;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const onVercel = !!process.env.VERCEL;
  return [
    {
      label: "Datos del negocio",
      ok: !b.street.includes("Ejemplo") && !b.taxId.includes("[") && !b.phone.includes("600 000 000"),
      help: "Sustituye dirección, teléfono, NIF y razón social de ejemplo.",
      href: "/admin/ajustes",
    },
    { label: "Catálogo real", ok: !hasDemo, help: "Añade tus productos y elimina los de demostración.", href: "/admin/ajustes#demo" },
    { label: "Dominio configurado", ok: siteUrl.startsWith("https://"), help: "Define NEXT_PUBLIC_SITE_URL con tu dominio https." },
    {
      label: "Pagos online (Stripe)",
      ok: !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET,
      help: "Añade STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET. Sin ellas solo se ofrece pago en tienda.",
    },
    { label: "Correo electrónico (SMTP)", ok: !!process.env.SMTP_HOST, help: "Sin SMTP los emails de confirmación no se envían." },
    {
      label: "Almacenamiento de fotos",
      ok: !onVercel || process.env.STORAGE_DRIVER === "supabase",
      help: "En Vercel usa STORAGE_DRIVER=supabase para que las fotos no se pierdan.",
    },
    { label: "Tareas programadas", ok: !!process.env.CRON_SECRET, help: "Define CRON_SECRET para recordatorios y limpieza automática." },
    { label: "Google Search Console", ok: !!settings.seo.googleSiteVerification, help: "Pega el código de verificación en Ajustes → SEO.", href: "/admin/ajustes" },
    { label: "Perfil de Empresa de Google", ok: !!b.googleBusinessUrl, help: "Enlaza tu ficha de Google Maps en Ajustes.", href: "/admin/ajustes" },
  ];
}
