import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABEL, ROLE_PERMISSIONS } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { NewUserForm, UserActions } from "./UserForms";

export const metadata = { title: "Usuarios y permisos" };

export default async function UsersPage() {
  const admin = await requirePermission("users.manage");
  const users = await db.adminUser.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      lockedUntil: true,
      totpEnabledAt: true,
      _count: { select: { passkeys: true, sessions: { where: { revokedAt: null, mfaVerified: true, expiresAt: { gt: new Date() } } } } },
    },
  });
  return (
    <>
      <PageHeader title="Usuarios y permisos" description="Cada persona con su propio usuario y solo los permisos que necesita. Todo lo que hacen queda registrado." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} title={u.name}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-cocoa-600">{u.email}</span>
                <Badge className="bg-cream-200 text-cocoa-800">{ROLE_LABEL[u.role]}</Badge>
                {!u.active && <Badge className="bg-stone-200 text-stone-700">Desactivado</Badge>}
                {u.totpEnabledAt || u._count.passkeys > 0 ? (
                  <Badge className="bg-emerald-100 text-emerald-900">2FA activo</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-900">2FA pendiente</Badge>
                )}
                {u.lockedUntil && u.lockedUntil > new Date() && <Badge className="bg-red-100 text-red-900">Bloqueado</Badge>}
                <span className="text-xs text-cocoa-500">
                  Último acceso: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "nunca"} · {u._count.sessions} sesión(es)
                </span>
              </div>
              {u.id !== admin.id ? (
                <div className="mt-3">
                  <UserActions id={u.id} role={u.role} active={u.active} locked={!!u.lockedUntil && u.lockedUntil > new Date()} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-cocoa-500">Eres tú. Tus datos se gestionan en «Mi cuenta y seguridad».</p>
              )}
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <Card title="Nuevo usuario">
            <NewUserForm />
          </Card>
          <Card title="Qué puede hacer cada rol">
            <ul className="space-y-3 text-sm">
              {(["STAFF", "MANAGER", "OWNER"] as const).map((r) => (
                <li key={r}>
                  <strong>{ROLE_LABEL[r]}</strong>
                  <span className="block text-xs text-cocoa-500">{[...ROLE_PERMISSIONS[r]].join(", ")}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
