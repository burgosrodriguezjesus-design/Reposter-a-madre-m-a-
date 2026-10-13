import "server-only";
import { cookies, headers } from "next/headers";
import type { AdminSession, AdminUser } from "@prisma/client";
import { db } from "@/lib/db";
import { keyedHash, sha256 } from "@/lib/crypto";
import { secureToken } from "@/lib/ids";
import { ipBucket, ipFromHeaders } from "@/lib/client-ip";

/**
 * Sesiones del panel guardadas en el servidor (revocables al instante).
 * - La cookie solo contiene un token aleatorio de 256 bits; en la BD se guarda su SHA-256.
 * - Cookie `__Host-` HttpOnly, Secure, SameSite=Strict, Path=/ (sin acceso desde JavaScript,
 *   no se envía desde otros sitios y no la puede fijar un subdominio).
 * - Caducidad por inactividad y absoluta; revocación al cambiar la contraseña, al desactivar el
 *   usuario o si cambia el navegador (posible robo de cookie).
 * - Hasta completar el segundo factor la sesión está "pendiente" (10 min, solo sirve para el MFA)
 *   y al completarlo se emite un token NUEVO (evita la fijación de sesión).
 */
const SECURE = process.env.NODE_ENV === "production" || (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
export const SESSION_COOKIE = SECURE ? "__Host-rmm_admin" : "rmm_admin";

const IDLE_MS = Number(process.env.ADMIN_SESSION_IDLE_MINUTES ?? 60) * 60_000;
const MAX_MS = Number(process.env.ADMIN_SESSION_MAX_HOURS ?? 12) * 3600_000;
const PENDING_MS = 10 * 60_000;
const TOUCH_MS = 60_000;

export type SessionWithUser = AdminSession & { user: AdminUser };

export async function requestFingerprint() {
  const h = await headers();
  const ua = (h.get("user-agent") ?? "").slice(0, 400);
  return {
    ipHash: keyedHash("ip", ipBucket(ipFromHeaders(h))),
    deviceHash: keyedHash("ua", ua),
    deviceLabel: describeUserAgent(ua),
  };
}

function describeUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} en ${os}` : browser;
}

export async function createSession(userId: string, mfaVerified: boolean): Promise<string> {
  const token = secureToken(32);
  const fp = await requestFingerprint();
  const ttl = mfaVerified ? MAX_MS : PENDING_MS;
  await db.adminSession.create({
    data: { id: sha256(token), userId, mfaVerified, ...fp, expiresAt: new Date(Date.now() + ttl) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: SECURE, sameSite: "strict", path: "/", maxAge: Math.floor(ttl / 1000), priority: "high" });
  return sha256(token);
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: SECURE, sameSite: "strict", path: "/", maxAge: 0 });
}

export async function revokeSession(id: string, reason: string) {
  await db.adminSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
}

export async function revokeUserSessions(userId: string, reason: string, exceptId?: string) {
  const { count } = await db.adminSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return count;
}

export type SessionProblem = "none" | "expired" | "revoked" | "device" | "inactive";

/**
 * Lee y valida la sesión de la cookie. No modifica cookies (se puede llamar al renderizar).
 * Devuelve el motivo si no es válida, para registrar posibles robos de sesión.
 */
export async function readSession(): Promise<{ session: SessionWithUser | null; problem: SessionProblem }> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 40 || token.length > 64) return { session: null, problem: "none" };
  const session = await db.adminSession.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session) return { session: null, problem: "none" };
  const now = Date.now();
  if (session.revokedAt) return { session: null, problem: "revoked" };
  if (session.expiresAt.getTime() < now || (session.mfaVerified && now - session.lastSeenAt.getTime() > IDLE_MS)) {
    await revokeSession(session.id, "caducada");
    return { session: null, problem: "expired" };
  }
  if (!session.user.active || session.createdAt < session.user.passwordChangedAt) {
    await revokeSession(session.id, "usuario desactivado o contraseña cambiada");
    return { session: null, problem: "inactive" };
  }
  const fp = await requestFingerprint();
  if (session.deviceHash && session.deviceHash !== fp.deviceHash) {
    await revokeSession(session.id, "cambio de navegador (posible robo de sesión)");
    return { session: { ...session }, problem: "device" };
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_MS || session.ipHash !== fp.ipHash) {
    await db.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date(), ipHash: fp.ipHash } });
  }
  return { session, problem: "none" };
}

/** ¿Ha usado antes este usuario este navegador? (para avisar de accesos desde dispositivos nuevos) */
export async function isKnownDevice(userId: string, deviceHash: string, excludeSessionId: string): Promise<boolean> {
  const seen = await db.adminSession.findFirst({
    where: { userId, deviceHash, mfaVerified: true, id: { not: excludeSessionId } },
    select: { id: true },
  });
  return !!seen;
}
