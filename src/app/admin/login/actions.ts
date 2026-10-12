"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { keyedHash } from "@/lib/crypto";
import { dummyHash, hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import { clearSessionCookie, createSession, requestFingerprint, revokeSession } from "@/lib/session";
import { completeLogin, confirmTotp, hasSecondFactor, registerMfaFailure, verifyCode } from "@/lib/mfa";
import { penalize, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { securityAlert } from "@/lib/alerts";
import { inc } from "@/lib/metrics";

type State = { error?: string } | null;

const WINDOW_MS = 15 * 60_000;
const GENERIC = "Email o contraseña incorrectos";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(160),
  password: z.string().min(1).max(200),
});

/**
 * Paso 1: email y contraseña.
 * - Límites por IP y por cuenta (compartidos entre instancias) y bloqueo progresivo de la cuenta.
 * - Mismo mensaje y tiempo de respuesta exista o no la cuenta (no revela qué emails hay).
 * - Solo se guardan huellas HMAC de IP y email en los intentos.
 */
export async function login(_prev: State, formData: FormData): Promise<State> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: GENERIC };
  const { email, password } = parsed.data;
  const fp = await requestFingerprint();
  const emailHash = keyedHash("login-email", email);

  const [byIp, byEmail] = await Promise.all([
    rateLimit("login-ip", fp.ipHash, 10, WINDOW_MS),
    rateLimit("login-email", emailHash, 6, WINDOW_MS),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    await db.loginAttempt.create({ data: { ipHash: fp.ipHash, emailHash, success: false } });
    if (!byIp.ok) {
      await securityAlert("admin.bruteforce", "Muchos intentos de acceso fallidos al panel desde la misma red.", { ipHash: fp.ipHash.slice(0, 12) }, { dedupe: fp.ipHash });
    }
    return { error: `Demasiados intentos. Espera ${Math.ceil(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec) / 60)} minutos e inténtalo de nuevo.` };
  }

  const user = await db.adminUser.findUnique({ where: { email } });
  const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  await db.loginAttempt.create({ data: { ipHash: fp.ipHash, emailHash, success: !!user && valid && !locked && user.active } });

  if (!user || !valid || !user.active || locked) {
    inc("admin_login_failures_total", { stage: "password" });
    await penalize(fp.ipHash, 1);
    if (user && !locked) {
      const failed = user.failedLogins + 1;
      // A partir de 5 fallos seguidos, bloqueo de 15 min que se duplica en cada nuevo fallo (máx. 24 h)
      const lockedUntil = failed >= 5 ? new Date(Date.now() + Math.min(15 * 60_000 * 2 ** (failed - 5), 86_400_000)) : null;
      await db.adminUser.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil } });
      if (lockedUntil) {
        await audit({ action: "auth.account_locked", entity: "AdminUser", entityId: user.id, severity: "alert", ipHash: fp.ipHash, details: { failed } });
        await securityAlert("admin.login_locked", "Cuenta del panel bloqueada temporalmente por contraseñas incorrectas.", { userId: user.id, failed }, { dedupe: user.id });
      }
    }
    if (user) await audit({ action: "auth.login_failed", entity: "AdminUser", entityId: user.id, severity: "warning", ipHash: fp.ipHash, details: { locked, active: user.active } });
    return { error: GENERIC };
  }

  if (needsRehash(user.passwordHash)) {
    await db.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  }
  await db.adminUser.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  // Sesión pendiente: solo sirve para completar el segundo factor
  const current = await getSession();
  if (current) await revokeSession(current.id, "nuevo inicio de sesión");
  await createSession(user.id, false);
  redirect((await hasSecondFactor(user.id, user.totpEnabledAt)) ? "/admin/login/verificar" : "/admin/login/configurar");
}

/** Paso 2: código de la app de autenticación o código de recuperación. */
export async function verifyMfa(_prev: State, formData: FormData): Promise<State> {
  const session = await getSession();
  if (!session || session.mfaVerified) redirect("/admin/login");
  const code = String(formData.get("code") ?? "").slice(0, 20);
  const method = await verifyCode(session, code);
  if (!method) {
    const locked = await registerMfaFailure(session);
    if (locked) {
      await clearSessionCookie();
      redirect("/admin/login?bloqueado=1");
    }
    return { error: "Código incorrecto o ya usado. Comprueba la hora de tu móvil e inténtalo de nuevo." };
  }
  await completeLogin(session, method);
  redirect("/admin");
}

/** Alta obligatoria del segundo factor en el primer acceso. Devuelve los códigos de recuperación. */
export async function confirmMfaSetup(_prev: { error?: string; codes?: string[] } | null, formData: FormData) {
  const session = await getSession();
  if (!session || session.mfaVerified) redirect("/admin/login");
  if (await hasSecondFactor(session.userId, session.user.totpEnabledAt)) redirect("/admin/login/verificar");
  const codes = await confirmTotp(session, String(formData.get("code") ?? "").slice(0, 12));
  if (!codes) {
    const locked = await registerMfaFailure(session);
    if (locked) redirect("/admin/login?bloqueado=1");
    return { error: "El código no es correcto. Escanea de nuevo el QR y usa el código actual." };
  }
  await audit({ action: "auth.mfa_enrolled", entity: "AdminUser", entityId: session.userId, ipHash: session.ipHash, details: { method: "totp" } });
  // Se marca ESTA sesión para poder terminar el acceso después de mostrar los códigos
  await db.adminSession.update({ where: { id: session.id }, data: { challenge: "enrolled" } });
  return { codes };
}

/** Tras guardar los códigos de recuperación: completa el acceso de la sesión que se acaba de inscribir. */
export async function finishEnrollment() {
  const session = await getSession();
  if (!session || session.mfaVerified || session.challenge !== "enrolled") redirect("/admin/login");
  await completeLogin(session, "enrollment");
  redirect("/admin");
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await revokeSession(session.id, "cierre de sesión");
    await audit({ action: "auth.logout", actor: { id: session.user.id, email: session.user.email, role: session.user.role }, ipHash: session.ipHash });
  }
  await clearSessionCookie();
  redirect("/admin/login");
}
