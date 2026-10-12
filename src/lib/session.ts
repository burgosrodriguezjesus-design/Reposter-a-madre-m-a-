/**
 * Firma y verificación de la sesión del panel (JWT HS256 en cookie httpOnly).
 * Sin dependencias de Node para poder usarse también en `proxy.ts`.
 */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "rmm_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET no está configurado (mínimo 32 caracteres). Revisa tu archivo .env");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<{ userId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.role !== "admin" || typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
