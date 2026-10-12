import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function startSession(userId: string) {
  const token = await signSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Usuario administrador de la sesión actual (o null). */
export const getAdmin = cache(async () => {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return db.adminUser.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true },
  });
});

/** Obligatorio al inicio de cada página y acción del panel. */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

const WINDOW_MS = 15 * 60 * 1000;

/** Bloqueo temporal tras demasiados intentos fallidos (por IP y por email). */
export async function isLoginBlocked(ip: string, email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byIp, byEmail] = await Promise.all([
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
  ]);
  return byIp >= 10 || byEmail >= 5;
}

export async function recordLoginAttempt(ip: string, email: string, success: boolean) {
  await db.loginAttempt.create({ data: { ip, email, success } });
  // Limpieza de intentos antiguos
  if (Math.random() < 0.05) {
    await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  }
}
