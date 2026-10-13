import "server-only";
import { emailHash, normalizePhone, phoneHash } from "@/lib/crypto";

/**
 * Búsqueda en el panel sobre datos cifrados.
 * - Email o teléfono completos: búsqueda exacta por índice ciego (rápida, indexada).
 * - Nombre u otro texto: se descifran los registros más recientes y se filtra en memoria,
 *   con un límite de registros revisados (los datos personales nunca se guardan en claro).
 */
export type PiiQuery =
  | { kind: "none" }
  | { kind: "email"; hash: string }
  | { kind: "phone"; hash: string }
  | { kind: "text"; needle: string };

export const SCAN_LIMIT = 3000;

export function parsePiiQuery(raw: string): PiiQuery {
  const q = raw.trim().slice(0, 120);
  if (!q) return { kind: "none" };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) return { kind: "email", hash: emailHash(q) };
  if (/^[+\d][\d\s().-]{5,}$/.test(q) && normalizePhone(q).length >= 9) return { kind: "phone", hash: phoneHash(q) };
  return { kind: "text", needle: fold(q) };
}

/** Minúsculas y sin tildes, para comparar nombres. */
export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function matchesText(needle: string, ...values: (string | null | undefined)[]): boolean {
  return values.some((v) => v && fold(v).includes(needle));
}
