/**
 * Cifrado de datos personales en la aplicación (AES-256-GCM) e índices ciegos (HMAC-SHA256).
 *
 * - Cada valor cifrado lleva la versión de clave: `enc:v1:<kid>:<iv>:<cifrado+etiqueta>`.
 *   Así se pueden rotar claves sin perder los datos antiguos (`npm run keys:rotate`).
 * - El nombre de la columna se usa como dato autenticado (AAD): un valor cifrado no se puede
 *   copiar a otra columna (p. ej. de `customerEmail` a `customerName`) sin que falle el descifrado.
 * - Los índices ciegos permiten buscar por email o teléfono sin guardar el dato en claro.
 *
 * Las claves se leen de variables de entorno (o de archivos `*_FILE`, para secretos de Docker o
 * Kubernetes) que proporciona el gestor de secretos del proveedor. Nunca se envían al navegador.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

type Keyring = { active: string; keys: Map<string, Buffer>; hashKey: Buffer };
let keyring: Keyring | null = null;

function env(name: string): string | undefined {
  const file = process.env[`${name}_FILE`];
  if (file) return readFileSync(file, "utf8").trim();
  return process.env[name]?.trim() || undefined;
}

function decodeKey(name: string, b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`${name}: la clave debe tener 32 bytes en base64 (openssl rand -base64 32)`);
  return key;
}

/** Carga y valida las claves (una sola vez). Lanza un error claro si faltan o son inválidas. */
export function loadKeyring(): Keyring {
  if (keyring) return keyring;
  const rawKeys = env("DATA_ENCRYPTION_KEYS");
  const hashKey = env("DATA_HASH_KEY");
  if (!rawKeys || !hashKey) {
    throw new Error(
      "Faltan DATA_ENCRYPTION_KEYS o DATA_HASH_KEY. Genera claves con `npm run keys:generate` y guárdalas en tu gestor de secretos.",
    );
  }
  const keys = new Map<string, Buffer>();
  for (const entry of rawKeys.split(",").map((s) => s.trim()).filter(Boolean)) {
    const sep = entry.indexOf(":");
    const kid = entry.slice(0, sep);
    if (sep < 1 || !/^[a-zA-Z0-9_-]{1,16}$/.test(kid)) throw new Error("DATA_ENCRYPTION_KEYS: formato esperado kid:base64,kid2:base64");
    keys.set(kid, decodeKey(`DATA_ENCRYPTION_KEYS[${kid}]`, entry.slice(sep + 1)));
  }
  const active = env("DATA_ENCRYPTION_ACTIVE_KEY") ?? [...keys.keys()].at(-1)!;
  if (!keys.has(active)) throw new Error(`DATA_ENCRYPTION_ACTIVE_KEY (${active}) no está en DATA_ENCRYPTION_KEYS`);
  keyring = { active, keys, hashKey: decodeKey("DATA_HASH_KEY", hashKey) };
  return keyring;
}

/** Solo para pruebas: olvida las claves cargadas. */
export function resetKeyringForTests() {
  keyring = null;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function activeKeyId(): string {
  return loadKeyring().active;
}

/** Cifra un texto. `context` (nombre de la columna) se autentica junto al dato. */
export function encrypt(plain: string, context: string): string {
  const { active, keys } = loadKeyring();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.get(active)!, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}${active}:${iv.toString("base64url")}:${body.toString("base64url")}`;
}

/** Descifra un valor; si no está cifrado (datos anteriores a la migración) lo devuelve tal cual. */
export function decrypt(value: string, context: string): string {
  if (!isEncrypted(value)) return value;
  const [kid, ivB64, bodyB64] = value.slice(PREFIX.length).split(":");
  const key = loadKeyring().keys.get(kid);
  if (!key || !ivB64 || !bodyB64) throw new Error(`Clave de cifrado desconocida (${kid})`);
  const body = Buffer.from(bodyB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString("utf8");
}

// Archivos binarios (fotos privadas de clientes): MAGIC | len(kid) | kid | iv | tag | cifrado
const FILE_MAGIC = Buffer.from("RMMENC1\0", "latin1");

export function isEncryptedBuffer(data: Buffer): boolean {
  return data.length > FILE_MAGIC.length && data.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
}

/** Cifra un archivo con AES-256-GCM y la clave activa; `context` (AAD) lo liga a su ruta. */
export function encryptBuffer(data: Buffer, context: string): Buffer {
  const { active, keys } = loadKeyring();
  const kid = Buffer.from(active, "utf8");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.get(active)!, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, Buffer.from([kid.length]), kid, iv, cipher.getAuthTag(), body]);
}

/** Descifra un archivo de encryptBuffer; los archivos antiguos sin cifrar se devuelven tal cual. */
export function decryptBuffer(data: Buffer, context: string): Buffer {
  if (!isEncryptedBuffer(data)) return data;
  let at = FILE_MAGIC.length;
  const kidLen = data[at++];
  const kid = data.subarray(at, (at += kidLen)).toString("utf8");
  const key = loadKeyring().keys.get(kid);
  if (!key) throw new Error(`Clave de cifrado desconocida (${kid})`);
  const iv = data.subarray(at, (at += IV_BYTES));
  const tag = data.subarray(at, (at += TAG_BYTES));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(at)), decipher.final()]);
}

/** ¿Está cifrado con una clave distinta de la activa? (para la rotación) */
export function needsReencryption(value: string): boolean {
  return !value.startsWith(`${PREFIX}${activeKeyId()}:`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Solo dígitos, sin prefijo internacional de España. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0034")) digits = digits.slice(4);
  else if (digits.startsWith("34") && digits.length === 11) digits = digits.slice(2);
  return digits;
}

/** Índice ciego: permite buscar por igualdad sin poder recuperar el dato original. */
export function blindIndex(kind: "email" | "phone" | "token", value: string): string {
  // "token": secretos de enlaces (baja, carrito) que se buscan por igualdad exacta
  const normalized = kind === "email" ? normalizeEmail(value) : kind === "phone" ? normalizePhone(value) : value;
  return createHmac("sha256", loadKeyring().hashKey).update(`${kind}:${normalized}`).digest("base64url");
}

/** Huella con clave para datos que solo se comparan (IP, user-agent). No reversible sin la clave. */
export function keyedHash(purpose: string, value: string): string {
  return createHmac("sha256", loadKeyring().hashKey).update(`${purpose}:${value}`).digest("base64url").slice(0, 32);
}

/** SHA-256 de un token aleatorio de alta entropía (sesiones, enlaces de verificación). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Genera un juego de claves nuevo (para `npm run keys:generate`). */
export function generateKeyMaterial() {
  return {
    encryptionKey: randomBytes(32).toString("base64"),
    hashKey: randomBytes(32).toString("base64"),
  };
}

export const emailHash = (email: string) => blindIndex("email", email);
export const phoneHash = (phone: string) => blindIndex("phone", phone);
