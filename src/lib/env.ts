import { loadKeyring } from "@/lib/crypto";

/**
 * Validación de la configuración al arrancar el servidor (protección frente a errores de
 * configuración). En producción, un error crítico impide arrancar: es preferible no servir
 * a servir de forma insegura (sin cifrado, con claves de prueba, sin HTTPS...).
 */
export function checkEnvironment(): { errors: string[]; warnings: string[] } {
  const env = process.env;
  const production = env.APP_ENV === "production" || (env.NODE_ENV === "production" && env.APP_ENV !== "staging" && env.APP_ENV !== "development");
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = (cond: boolean, msg: string, critical = production) => {
    if (!cond) (critical ? errors : warnings).push(msg);
  };

  need(!!env.DATABASE_URL, "DATABASE_URL no está definido", true);
  try {
    loadKeyring();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Claves de cifrado no válidas");
  }
  const site = env.NEXT_PUBLIC_SITE_URL ?? "";
  need(site.startsWith("https://"), "NEXT_PUBLIC_SITE_URL debe usar https:// en producción");
  need((env.CRON_SECRET ?? "").length >= 32, "CRON_SECRET debe tener al menos 32 caracteres");
  if (env.METRICS_TOKEN !== undefined) need(env.METRICS_TOKEN.length >= 32, "METRICS_TOKEN debe tener al menos 32 caracteres", true);
  if (env.STRIPE_SECRET_KEY) {
    need(!!env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET es obligatorio si se usa Stripe", true);
    if (env.APP_ENV === "production") need(/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY), "Producción con claves de Stripe de PRUEBA", false);
    if (env.APP_ENV !== "production") need(!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY), "Entorno de pruebas con claves de Stripe REALES", true);
  }
  need(!!env.TRUST_PROXY || !!env.VERCEL, "Define TRUST_PROXY (vercel | cloudflare | nginx | none) para obtener la IP real de forma segura", false);
  need(!!env.REDIS_URL, "Sin REDIS_URL los límites de peticiones no se comparten entre instancias", false);
  need(!!env.SMTP_HOST, "Sin SMTP_HOST no se envían emails a clientes", false);
  need(!(production && env.SMTP_ALLOW_PLAINTEXT === "true"), "SMTP_ALLOW_PLAINTEXT=true en producción: los emails viajarían sin cifrar", true);
  need(!!env.ALERT_EMAIL || !!env.ALERT_WEBHOOK_URL, "Define ALERT_EMAIL o ALERT_WEBHOOK_URL para recibir alertas de seguridad", false);
  if (env.VERCEL) need(env.STORAGE_DRIVER === "supabase", "En Vercel el disco es efímero: usa STORAGE_DRIVER=supabase", true);
  if (production && env.ADMIN_PASSWORD) warnings.push("ADMIN_PASSWORD sigue definido en producción: bórralo tras crear el primer usuario");
  if (production && env.PASSWORD_BREACH_CHECK === "false") warnings.push("La comprobación de contraseñas filtradas está desactivada");
  if (production && env.DATABASE_URL && !/sslmode=(require|verify-full|verify-ca)|localhost|127\.0\.0\.1|@pgbouncer|@postgres[:/]/.test(env.DATABASE_URL)) {
    warnings.push("DATABASE_URL sin sslmode=require: la conexión con la base de datos debería ir cifrada");
  }
  return { errors, warnings };
}
