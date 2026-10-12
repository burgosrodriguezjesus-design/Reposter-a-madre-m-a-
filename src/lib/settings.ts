import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { cached, invalidateMicroCache } from "@/lib/micro-cache";
import {
  DEFAULT_BUILDER,
  DEFAULT_BUSINESS,
  DEFAULT_MARKETING,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_ORDERING,
  DEFAULT_SEO,
} from "@/config/defaults";
import type { AllSettings, SettingsKey } from "@/lib/settings-types";

export const SETTINGS_DEFAULTS: AllSettings = {
  business: DEFAULT_BUSINESS,
  ordering: DEFAULT_ORDERING,
  marketing: DEFAULT_MARKETING,
  seo: DEFAULT_SEO,
  notifications: DEFAULT_NOTIFICATIONS,
  builder: DEFAULT_BUILDER,
};

/** Ajustes combinados con los valores por defecto (una consulta por petición). */
export const getSettings = cache(async (): Promise<AllSettings> => {
  // Micro-caché de 15 s por instancia: los ajustes se leen en casi todas las páginas y APIs
  const rows = await cached("settings", 15_000, () => db.setting.findMany());
  const result = structuredClone(SETTINGS_DEFAULTS) as AllSettings;
  for (const row of rows) {
    const key = row.key as SettingsKey;
    if (key in result && row.value && typeof row.value === "object") {
      // @ts-expect-error — combinación tipada por clave
      result[key] = { ...result[key], ...(row.value as object) };
    }
  }
  return result;
});

export async function saveSettings<K extends SettingsKey>(key: K, value: AllSettings[K]) {
  invalidateMicroCache();
  const json = value as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}

/** Nombre de la ciudad en minúsculas sin acentos para URLs: "Alcalá de Henares" → "alcala-de-henares" */
export { slugify as citySlug } from "@/lib/format";
