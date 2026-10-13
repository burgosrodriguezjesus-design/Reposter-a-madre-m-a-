import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

/**
 * Contraseñas del panel con Argon2id (parámetros mínimos recomendados por OWASP:
 * m=19 MiB, t=2, p=1). Los hashes bcrypt antiguos se aceptan y se actualizan al iniciar sesión.
 */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
// Algorithm.Argon2id = 2 (const enum; se escribe el valor para no depender de él en tiempo de compilación)
const ARGON2ID = 2;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, { ...ARGON, algorithm: ARGON2ID });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith("$argon2")) return await argonVerify(stored, password);
    if (stored.startsWith("$2")) return await bcrypt.compare(password, stored);
  } catch {
    return false;
  }
  return false;
}

/** ¿Hay que recalcular el hash (bcrypt antiguo o parámetros más débiles)? */
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith("$argon2id$")) return true;
  const m = /m=(\d+),t=(\d+)/.exec(stored);
  return !m || Number(m[1]) < ARGON.memoryCost || Number(m[2]) < ARGON.timeCost;
}

/** Hash ficticio para igualar tiempos cuando el email no existe (no revela qué cuentas hay). */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("contraseña-inexistente-para-igualar-tiempos");
  return dummy;
}

const COMMON = new Set([
  "123456789012", "contraseña123", "password1234", "qwertyuiop12", "reposteria123", "madremia1234", "administrador",
  "admin1234567", "123456789abc", "iloveyou1234", "tartas123456", "pastelería12", "bienvenido123", "1234567890ab",
]);

/** Política: 12+ caracteres, no trivial, distinta del email y del nombre del negocio. */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < 12) return "La contraseña debe tener al menos 12 caracteres (mejor una frase de varias palabras).";
  if (password.length > 200) return "La contraseña es demasiado larga.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password) || /^(0123456789|1234567890|abcdefghijkl)/.test(lower)) {
    return "Esa contraseña es demasiado común.";
  }
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "La contraseña no puede contener tu email.";
  if (context.name && context.name.length >= 4 && lower.includes(context.name.toLowerCase())) return "La contraseña no puede contener tu nombre.";
  return null;
}

/**
 * Comprueba si la contraseña aparece en filtraciones conocidas (Have I Been Pwned, k-anonimato:
 * solo se envían los 5 primeros caracteres del SHA-1). Si el servicio no responde, no bloquea.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (process.env.PASSWORD_BREACH_CHECK === "false") return false;
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const suffix = sha1.slice(5);
    return (await res.text()).split("\n").some((line) => line.startsWith(suffix) && !line.endsWith(":0"));
  } catch {
    return false;
  }
}
