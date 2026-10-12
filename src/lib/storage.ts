import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { secureToken } from "@/lib/ids";

/**
 * Almacenamiento de fotografías.
 *  - STORAGE_DRIVER=local    → carpeta UPLOAD_DIR (por defecto ./uploads), servida en /uploads/...
 *  - STORAGE_DRIVER=supabase → Supabase Storage (bucket público). Recomendado en Vercel.
 * Todas las imágenes se re-codifican a WebP: se reduce su peso, se eliminan metadatos
 * (p. ej. la ubicación GPS de las fotos del móvil) y se descartan archivos que no sean imágenes.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];

export type Folder = "products" | "references" | "site" | "categories";

export type StoredImage = { url: string; width: number; height: number };

export class UploadError extends Error {}

function driver(): "local" | "supabase" {
  return process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "local";
}

export function uploadDir(): string {
  // Carpeta decidida en tiempo de ejecución: no debe incluirse en el empaquetado
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "uploads");
}

export async function saveImage(file: File, folder: Folder, maxWidth = 1600): Promise<StoredImage> {
  if (file.size === 0) throw new UploadError("El archivo está vacío");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("La imagen supera los 10 MB");
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    throw new UploadError("Formato no admitido. Usa JPG, PNG, WebP o HEIC");
  }

  let output: { data: Buffer; info: { width: number; height: number } };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    output = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new UploadError("No hemos podido leer la imagen. Prueba con otra foto");
  }

  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${secureToken(12)}.webp`;
  const url = driver() === "supabase" ? await putSupabase(key, output.data) : await putLocal(key, output.data);
  return { url, width: output.info.width, height: output.info.height };
}

export async function deleteImage(url: string): Promise<void> {
  try {
    if (url.startsWith("/uploads/")) {
      const file = path.join(uploadDir(), url.replace("/uploads/", ""));
      if (file.startsWith(uploadDir())) await unlink(/*turbopackIgnore: true*/ file);
    } else if (driver() === "supabase" && url.includes("/storage/v1/object/public/")) {
      const { base, bucket, key } = supabaseConfig();
      const prefix = `${base}/storage/v1/object/public/${bucket}/`;
      if (!url.startsWith(prefix)) return;
      await fetch(`${base}/storage/v1/object/${bucket}/${url.slice(prefix.length)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      });
    }
  } catch (error) {
    console.warn("[storage] No se pudo borrar", url, error);
  }
}

/** URLs aceptadas como foto de referencia (solo las subidas a nuestro almacenamiento). */
export function isOwnUploadUrl(url: string): boolean {
  if (url.startsWith("/uploads/references/") && !url.includes("..")) return true;
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
  return !!base && url.startsWith(`${base}/storage/v1/object/public/${bucket}/references/`);
}

async function putLocal(key: string, data: Buffer): Promise<string> {
  const file = path.join(uploadDir(), key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ file, data);
  return `/uploads/${key}`;
}

export async function readLocal(relative: string): Promise<Buffer | null> {
  const file = path.resolve(uploadDir(), relative);
  if (!file.startsWith(uploadDir() + path.sep)) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ file);
  } catch {
    return null;
  }
}

function supabaseConfig() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
  if (!base || !key) throw new UploadError("Supabase Storage no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return { base, key, bucket };
}

async function putSupabase(objectKey: string, data: Buffer): Promise<string> {
  const { base, key, bucket } = supabaseConfig();
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${objectKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "image/webp",
      "Cache-Control": "31536000",
      "x-upsert": "false",
    },
    body: new Uint8Array(data),
  });
  if (!res.ok) {
    console.error("[storage] Supabase", res.status, await res.text());
    throw new UploadError("No se pudo guardar la imagen");
  }
  return `${base}/storage/v1/object/public/${bucket}/${objectKey}`;
}
