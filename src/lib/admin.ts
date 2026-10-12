import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

/** Tras cambiar catálogo o ajustes, regenera todas las páginas públicas en caché. */
export function revalidateSite() {
  revalidatePath("/", "layout");
}

export function friendlyDbError(error: unknown, fallback = "No se pudo guardar"): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "Ya existe un elemento con ese identificador (URL o código). Usa otro.";
    if (error.code === "P2003") return "No se puede borrar porque está en uso.";
    if (error.code === "P2025") return "El elemento ya no existe.";
  }
  console.error(error);
  return fallback;
}

export function bool(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

export function str(formData: FormData, name: string, max = 500): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

export function int(formData: FormData, name: string, fallback = 0): number {
  const n = Number(formData.get(name));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function optionalInt(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "2026-10-12" (input type=date) → Date al inicio del día, o null */
export function dateOrNull(formData: FormData, name: string, endOfDay = false): Date | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T${endOfDay ? "23:59:59" : "00:00:00"}`);
}
