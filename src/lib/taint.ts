import { readFileSync } from "node:fs";
import { experimental_taintUniqueValue as taintUniqueValue } from "react";

/**
 * Defensa adicional: React impide que estos valores lleguen a un Componente de Cliente
 * (si por error se pasaran como prop, el renderizado falla en lugar de filtrarlos).
 */
const SECRETS = [
  "DATA_ENCRYPTION_KEYS",
  "DATA_HASH_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SMTP_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_TOKEN",
  "CRON_SECRET",
  "METRICS_TOKEN",
  "DATABASE_URL",
  "DIRECT_URL",
  "REDIS_URL",
  "ADMIN_PASSWORD",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
  "ALERT_WEBHOOK_URL",
];

if (typeof taintUniqueValue === "function") {
  for (const name of SECRETS) {
    const value = process.env[name];
    if (value && value.length >= 8) taintUniqueValue(`No se puede enviar ${name} al navegador`, process, value);
    // También las claves leídas de archivo (*_FILE, secretos montados)
    const file = process.env[`${name}_FILE`];
    if (file) {
      try {
        const fromFile = readFileSync(file, "utf8").trim();
        if (fromFile.length >= 8) taintUniqueValue(`No se puede enviar ${name} al navegador`, process, fromFile);
      } catch {
        // crypto.ts informa del error al cargar la clave
      }
    }
  }
}
