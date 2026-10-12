"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminRole } from "@prisma/client";
import { db } from "@/lib/db";
import { auditAdmin, requirePermission, type AdminContext } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { revokeUserSessions } from "@/lib/session";
import { securityAlert } from "@/lib/alerts";
import { secureToken } from "@/lib/ids";

type Result = { ok: boolean; message?: string; error?: string; password?: string } | null;
const ROLES = ["OWNER", "MANAGER", "STAFF"] as const;

const newUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  role: z.enum(ROLES),
});

async function changed(admin: AdminContext, action: string, userId: string, details: Record<string, unknown> = {}) {
  await auditAdmin(admin, { action, entity: "AdminUser", entityId: userId, severity: "warning", details });
  await securityAlert("admin.user_changed", "Cambio en los usuarios o permisos del panel.", { by: admin.id, userId, action });
}

/** Alta de usuario con contraseña provisional aleatoria (se muestra una sola vez). */
export async function createUser(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requirePermission("users.manage");
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa el nombre, el email y el rol" };
  if (await db.adminUser.findUnique({ where: { email: parsed.data.email } })) return { ok: false, error: "Ya existe un usuario con ese email" };
  const password = `${secureToken(12)}-${secureToken(6)}`;
  const user = await db.adminUser.create({ data: { ...parsed.data, passwordHash: await hashPassword(password) } });
  await changed(admin, "users.create", user.id, { role: parsed.data.role });
  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    message: `Usuario creado. Entrégale esta contraseña provisional en persona o por un canal seguro; en su primer acceso deberá activar la verificación en dos pasos y conviene que la cambie.`,
    password,
  };
}

/** Comprueba que el cambio no deja el panel sin ningún propietario activo. */
async function keepsAnOwner(targetId: string, next: { role?: AdminRole; active?: boolean }) {
  const target = await db.adminUser.findUnique({ where: { id: targetId }, select: { role: true, active: true } });
  if (!target || target.role !== "OWNER" || !target.active) return true;
  if ((next.role ?? "OWNER") === "OWNER" && (next.active ?? true)) return true;
  const owners = await db.adminUser.count({ where: { role: "OWNER", active: true, id: { not: targetId } } });
  return owners > 0;
}

export async function updateUser(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requirePermission("users.manage");
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (id === admin.id) return { ok: false, error: "Tus propios datos se gestionan en «Mi cuenta y seguridad»" };
  const target = await db.adminUser.findUnique({ where: { id }, select: { id: true, role: true, active: true } });
  if (!target) return { ok: false, error: "Usuario no encontrado" };

  if (intent === "role") {
    const role = String(formData.get("role") ?? "") as AdminRole;
    if (!ROLES.includes(role)) return { ok: false, error: "Rol no válido" };
    if (!(await keepsAnOwner(id, { role }))) return { ok: false, error: "Debe quedar al menos un propietario activo" };
    await db.adminUser.update({ where: { id }, data: { role } });
    await revokeUserSessions(id, "cambio de rol");
    await changed(admin, "users.role_change", id, { before: target.role, after: role });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Rol actualizado. El usuario deberá volver a entrar." };
  }
  if (intent === "deactivate" || intent === "activate") {
    const active = intent === "activate";
    if (!active && !(await keepsAnOwner(id, { active: false }))) return { ok: false, error: "Debe quedar al menos un propietario activo" };
    await db.adminUser.update({ where: { id }, data: { active, failedLogins: 0, lockedUntil: null } });
    if (!active) await revokeUserSessions(id, "usuario desactivado");
    await changed(admin, active ? "users.activate" : "users.deactivate", id);
    revalidatePath("/admin/usuarios");
    return { ok: true, message: active ? "Usuario reactivado" : "Usuario desactivado y sesiones cerradas" };
  }
  if (intent === "reset-mfa") {
    // Para cuando alguien pierde el móvil: deberá configurar de nuevo el segundo factor
    await db.$transaction([
      db.adminPasskey.deleteMany({ where: { userId: id } }),
      db.adminUser.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] } }),
    ]);
    await revokeUserSessions(id, "segundo factor restablecido");
    await changed(admin, "users.mfa_reset", id);
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Segundo factor restablecido. Al entrar deberá configurarlo de nuevo." };
  }
  if (intent === "unlock") {
    await db.adminUser.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
    await changed(admin, "users.unlock", id);
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Cuenta desbloqueada" };
  }
  if (intent === "sessions") {
    const count = await revokeUserSessions(id, "cerradas por el propietario");
    await changed(admin, "users.sessions_revoked", id, { count });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: `${count} sesión(es) cerradas` };
  }
  return { ok: false, error: "Acción no válida" };
}
