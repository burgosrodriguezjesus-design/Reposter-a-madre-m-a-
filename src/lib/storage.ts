import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { secureToken } from "@/lib/ids";
import { decryptBuffer, encryptBuffer, keyedHash, safeEqual } from "@/lib/crypto";
import { log } from "@/lib/logger";

/**
 * Almacenamiento de fotografías.
 *  - STORAGE_DRIVER=local    → carpeta UPLOAD_DIR (por defecto ./uploads), servida en /uploads/...
 *  - STORAGE_DRIVER=supabase → Supabase Storage. Recomendado en Vercel.
 * Fotos públicas (productos, negocio) y PRIVADAS (fotos de referencia de los clientes):
 * las privadas nunca tienen URL pública; se guardan como `private:references/...` y solo se
 * sirven con una URL firmada que caduca (ver `signedMediaUrl` y /api/media). Además se guardan
 * CIFRADAS con AES-256-GCM (clave activa de DATA_ENCRYPTION_KEYS): ni el proveedor de
 * almacenamiento ni una copia del volumen o del bucket permiten verlas sin la clave.
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

/** Firmas de archivo reales (no basta con el tipo que declara el navegador). */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const hex = buf.subarray(0, 12).toString("hex");
  const ascii = buf.subarray(4, 12).toString("latin1");
  return (
    hex.startsWith("ffd8ff") || // JPEG
    hex.startsWith("89504e470d0a1a0a") || // PNG
    (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") ||
    /^ftyp(heic|heix|hevc|mif1|msf1|avif|avis)/.test(ascii) // HEIC / AVIF
  );
}

/** Valida, limpia (sin metadatos ni GPS) y convierte a WebP. Rechaza lo que no sea una imagen real. */
async function processImage(file: File, maxWidth: number) {
  if (file.size === 0) throw new UploadError("El archivo está vacío");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("La imagen supera los 10 MB");
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    throw new UploadError("Formato no admitido. Usa JPG, PNG, WebP o HEIC");
  }
  const input = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(input)) throw new UploadError("El archivo no es una imagen válida");
  try {
    const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new Error("dimensiones");
    return await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new UploadError("No hemos podido leer la imagen. Prueba con otra foto");
  }
}

export async function saveImage(file: File, folder: Folder, maxWidth = 1600): Promise<StoredImage> {
  if (folder === "references") throw new UploadError("Las fotos de clientes se guardan con savePrivateImage");
  const output = await processImage(file, maxWidth);
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
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${url.slice(prefix.length)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && res.status !== 404) log.warn("storage.delete_failed", { status: res.status });
    }
  } catch (error) {
    log.warn("storage.delete_failed", { error });
  }
}

// ───────────── Fotos privadas de clientes ─────────────

const PRIVATE_REF = /^private:references\/\d{4}-\d{2}\/[A-Za-z0-9_-]{16}\.webp$/;
const LEGACY_REF = /^\/uploads\/references\/\d{4}-\d{2}\/[A-Za-z0-9_-]{16}\.webp$/;

/** Referencias aceptadas como foto de referencia (solo las subidas a nuestro almacenamiento privado). */
export function isOwnUploadUrl(ref: string): boolean {
  return PRIVATE_REF.test(ref);
}

export function isPrivateRef(ref: string | null | undefined): ref is string {
  return !!ref && (PRIVATE_REF.test(ref) || LEGACY_REF.test(ref));
}

function privateKey(ref: string): string {
  // "private:references/2026-10/x.webp" → "references/2026-10/x.webp"; formato antiguo "/uploads/references/..."
  return ref.startsWith("private:") ? ref.slice("private:".length) : ref.replace(/^\/uploads\//, "");
}

export async function savePrivateImage(file: File): Promise<{ ref: string }> {
  const output = await processImage(file, 1600);
  const key = `references/${new Date().toISOString().slice(0, 7)}/${secureToken(12)}.webp`;
  const sealed = encryptBuffer(output.data, `media:${key}`);
  if (driver() === "supabase") await putSupabase(key, sealed, privateBucket());
  else await putLocal(`private/${key}`, sealed);
  return { ref: `private:${key}` };
}

export async function readPrivate(ref: string): Promise<Buffer | null> {
  if (!isPrivateRef(ref)) return null;
  const key = privateKey(ref);
  if (driver() === "supabase" && ref.startsWith("private:")) {
    const { base, key: serviceKey } = supabaseConfig();
    const res = await fetch(`${base}/storage/v1/object/authenticated/${privateBucket()}/${key}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? openPrivate(Buffer.from(await res.arrayBuffer()), key) : null;
  }
  const data = await readLocal(ref.startsWith("private:") ? `private/${key}` : key);
  return data ? openPrivate(data, key) : null;
}

function openPrivate(data: Buffer, key: string): Buffer | null {
  try {
    return decryptBuffer(data, `media:${key}`);
  } catch (error) {
    log.error("storage.decrypt_failed", { error });
    return null;
  }
}

export async function deletePrivate(ref: string): Promise<void> {
  if (!isPrivateRef(ref)) return;
  const key = privateKey(ref);
  try {
    if (driver() === "supabase" && ref.startsWith("private:")) {
      const { base, key: serviceKey } = supabaseConfig();
      const res = await fetch(`${base}/storage/v1/object/${privateBucket()}/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        signal: AbortSignal.timeout(10_000),
      });
      // 404 = ya no existe; cualquier otro fallo debe verse (si no, quedaría una foto huérfana)
      if (!res.ok && res.status !== 404) throw new Error(`Supabase respondió ${res.status} al borrar`);
    } else {
      const file = path.join(uploadDir(), ref.startsWith("private:") ? `private/${key}` : key);
      if (file.startsWith(uploadDir())) {
        await unlink(/*turbopackIgnore: true*/ file).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") throw e; // ya no existe: borrado completado
        });
      }
    }
  } catch (error) {
    log.error("storage.delete_private_failed", { error });
    throw error;
  }
}

function mediaSignature(ref: string, exp: number): string {
  return createHmac("sha256", keyedHash("media-key", "v1")).update(`${ref}|${exp}`).digest("base64url");
}

/** URL temporal (por defecto 10 min) para ver una foto privada. */
export function signedMediaUrl(ref: string | null | undefined, ttlSeconds = 600): string | null {
  if (!isPrivateRef(ref)) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/media?${new URLSearchParams({ ref, exp: String(exp), sig: mediaSignature(ref, exp) })}`;
}

export function verifyMediaSignature(ref: string, exp: string, sig: string): boolean {
  const e = Number(exp);
  if (!isPrivateRef(ref) || !Number.isInteger(e) || e < Date.now() / 1000 || e > Date.now() / 1000 + 86_400) return false;
  return safeEqual(mediaSignature(ref, e), sig);
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

function privateBucket(): string {
  return process.env.SUPABASE_PRIVATE_BUCKET || "private";
}

function supabaseConfig() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
  if (!base || !key) throw new UploadError("Supabase Storage no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return { base, key, bucket };
}

async function putSupabase(objectKey: string, data: Buffer, targetBucket?: string): Promise<string> {
  const { base, key, bucket: publicBucket } = supabaseConfig();
  const bucket = targetBucket ?? publicBucket;
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
    log.error("storage.supabase_upload_failed", { status: res.status });
    throw new UploadError("No se pudo guardar la imagen");
  }
  return `${base}/storage/v1/object/public/${bucket}/${objectKey}`;
}
