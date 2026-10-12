/** Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011). */
export const ALLERGENS = [
  { key: "gluten", label: "Gluten", emoji: "🌾" },
  { key: "crustaceos", label: "Crustáceos", emoji: "🦐" },
  { key: "huevos", label: "Huevos", emoji: "🥚" },
  { key: "pescado", label: "Pescado", emoji: "🐟" },
  { key: "cacahuetes", label: "Cacahuetes", emoji: "🥜" },
  { key: "soja", label: "Soja", emoji: "🫘" },
  { key: "lacteos", label: "Lácteos", emoji: "🥛" },
  { key: "frutos-cascara", label: "Frutos de cáscara", emoji: "🌰" },
  { key: "apio", label: "Apio", emoji: "🥬" },
  { key: "mostaza", label: "Mostaza", emoji: "🟡" },
  { key: "sesamo", label: "Sésamo", emoji: "⚪" },
  { key: "sulfitos", label: "Sulfitos", emoji: "🍷" },
  { key: "altramuces", label: "Altramuces", emoji: "🌼" },
  { key: "moluscos", label: "Moluscos", emoji: "🐚" },
] as const;

export type AllergenKey = (typeof ALLERGENS)[number]["key"];

export const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key) as string[];

export function allergenLabel(key: string): string {
  return ALLERGENS.find((a) => a.key === key)?.label ?? key;
}

/** Ocasiones con las que se pueden etiquetar los productos (filtro del catálogo). */
export const OCCASIONS = [
  { key: "cumpleanos", label: "Cumpleaños" },
  { key: "boda", label: "Boda" },
  { key: "aniversario", label: "Aniversario" },
  { key: "bautizo-comunion", label: "Bautizo y comunión" },
  { key: "baby-shower", label: "Baby shower" },
  { key: "empresa", label: "Eventos de empresa" },
  { key: "regalo", label: "Para regalar" },
  { key: "merienda", label: "Merienda y capricho" },
  { key: "navidad", label: "Navidad" },
  { key: "san-valentin", label: "San Valentín" },
  { key: "halloween", label: "Halloween" },
] as const;

export function occasionLabel(key: string): string {
  return OCCASIONS.find((o) => o.key === key)?.label ?? key;
}
