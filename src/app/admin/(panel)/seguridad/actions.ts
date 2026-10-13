"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditAdmin, requireAdmin } from "@/lib/auth";
import { hashPassword, isBreachedPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { regenerateRecoveryCodes } from "@/lib/mfa";
import { createSession, revokeSession, revokeUserSessions } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/components/admin/forms";

const passwordSchema = z.object({ current: z.string().min(1).max(200), next: z.string().max(200), confirm: z.string().max(200) });

/** Cambio de contraseña: exige la actual, aplica la política y cierra las demás sesiones. */
export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!(await rateLimit("password-change", admin.id, 5, 15 * 60_000)).ok) return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Rellena todos los campos" };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { ok: false, error: "La nueva contraseña y su repetición no coinciden" };
  const problem = passwordProblem(next, { email: admin.email, name: admin.name });
  if (problem) return { ok: false, error: problem };
  const user = await db.adminUser.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    await auditAdmin(admin, { action: "auth.password_change_failed", severity: "warning" });
    return { ok: false, error: "La contraseña actual no es correcta" };
  }
  if (await isBreachedPassword(next)) return { ok: false, error: "Esa contraseña aparece en filtraciones públicas de datos. Elige otra." };
  // passwordChangedAt invalida todas las sesiones anteriores; se abre una nueva para este navegador
  await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(), mustChangePassword: false } });
  await revokeSession(admin.sessionId, "cambio de contraseña");
  await createSession(admin.id, true);
  await auditAdmin(admin, { action: "auth.password_changed", severity: "warning" });
  return { ok: true, message: "Contraseña cambiada. Se han cerrado tus otras sesiones." };
}

export async function revokeMySession(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  // Solo sesiones propias
  await db.adminSession.updateMany({ where: { id, userId: admin.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "cerrada por el usuario" } });
  await auditAdmin(admin, { action: "auth.session_revoked", entity: "AdminSession" });
  revalidatePath("/admin/seguridad");
}

export async function revokeOtherSessions() {
  const admin = await requireAdmin();
  const count = await revokeUserSessions(admin.id, "cerradas por el usuario", admin.sessionId);
  await auditAdmin(admin, { action: "auth.sessions_revoked_all", details: { count } });
  revalidatePath("/admin/seguridad");
}

export async function newRecoveryCodes(_prev: { codes?: string[]; error?: string } | null, formData: FormData) {
  const admin = await requireAdmin();
  const user = await db.adminUser.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(String(formData.get("password") ?? ""), user.passwordHash))) return { error: "Contraseña incorrecta" };
  const codes = await regenerateRecoveryCodes(admin.id);
  await auditAdmin(admin, { action: "auth.recovery_codes_regenerated", severity: "warning" });
  return { codes };
}

export async function removePasskey(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const [user, keys] = await Promise.all([
    db.adminUser.findUnique({ where: { id: admin.id }, select: { totpEnabledAt: true } }),
    db.adminPasskey.count({ where: { userId: admin.id } }),
  ]);
  // Nunca dejar la cuenta sin segundo factor
  if (!user?.totpEnabledAt && keys <= 1) return;
  await db.adminPasskey.deleteMany({ where: { id, userId: admin.id } });
  await auditAdmin(admin, { action: "auth.passkey_removed", severity: "warning" });
  revalidatePath("/admin/seguridad");
}
