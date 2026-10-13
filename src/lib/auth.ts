import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AdminRole } from "@prisma/client";
import { readSession, requestFingerprint, type SessionWithUser } from "@/lib/session";
import { can, type Permission } from "@/lib/rbac";
import { audit, type AuditEntry } from "@/lib/audit";
import { securityAlert } from "@/lib/alerts";
import { penalizeClient } from "@/lib/rate-limit";

/**
 * Autorización del panel. TODA página, acción y API del panel llama a `requirePermission`
 * (o `requireAdmin`) en el servidor: el menú oculto o el proxy no son una barrera suficiente.
 */
export type AdminContext = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  sessionId: string;
  mustChangePassword: boolean;
};

const toContext = (s: SessionWithUser): AdminContext => ({
  id: s.user.id,
  email: s.user.email,
  name: s.user.name,
  role: s.user.role,
  sessionId: s.id,
  mustChangePassword: s.user.mustChangePassword,
});

/** Sesión de la petición actual (completa o pendiente de MFA). */
export const getSession = cache(async () => {
  const { session, problem } = await readSession();
  if (problem === "device" && session) {
    await securityAlert("admin.session_hijack_suspected", "Se ha usado una cookie de sesión del panel desde otro navegador; la sesión se ha revocado.", {
      userId: session.userId,
    });
    await audit({ action: "auth.session_device_mismatch", entity: "AdminUser", entityId: session.userId, severity: "alert" });
    return null;
  }
  return session;
});

/** Administrador con sesión completa (contraseña + segundo factor) o null. */
export const getAdmin = cache(async (): Promise<AdminContext | null> => {
  const session = await getSession();
  return session?.mfaVerified ? toContext(session) : null;
});

export async function requireAdmin(): Promise<AdminContext> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (!session.mfaVerified) redirect(session.user.totpEnabledAt ? "/admin/login/verificar" : "/admin/login/configurar");
  return toContext(session);
}

async function denied(admin: AdminContext, permission: Permission) {
  const { ipHash } = await requestFingerprint();
  await audit({ action: "access.denied", actor: admin, ipHash, severity: "warning", details: { permission } });
  await penalizeClient(2);
  await securityAlert("admin.permission_denied", "Un usuario del panel ha intentado una acción sin permiso.", { userId: admin.id, permission }, { dedupe: admin.id });
}

/** Para páginas y Server Actions: sin permiso → vuelve al inicio del panel con aviso. */
export async function requirePermission(permission: Permission): Promise<AdminContext> {
  const admin = await requireAdmin();
  // Con contraseña provisional solo se puede entrar a «Mi cuenta y seguridad» (requireAdmin)
  if (admin.mustChangePassword) redirect("/admin/seguridad?cambiar=1");
  if (!can(admin.role, permission)) {
    await denied(admin, permission);
    redirect("/admin?sin-permiso=1");
  }
  return admin;
}

/** Para rutas de API: devuelve el administrador o una respuesta 401/403. */
export async function apiRequirePermission(permission: Permission): Promise<AdminContext | Response> {
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (admin.mustChangePassword) return Response.json({ error: "Cambia antes tu contraseña provisional" }, { status: 403 });
  if (!can(admin.role, permission)) {
    await denied(admin, permission);
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  return admin;
}

/** Registra en la auditoría una acción hecha por el administrador actual. */
export async function auditAdmin(admin: AdminContext, entry: Omit<AuditEntry, "actor" | "ipHash">) {
  const { ipHash } = await requestFingerprint();
  await audit({ ...entry, actor: { id: admin.id, email: admin.email, role: admin.role }, ipHash });
}
