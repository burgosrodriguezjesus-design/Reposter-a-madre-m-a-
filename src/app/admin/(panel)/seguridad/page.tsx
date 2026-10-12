import { KeyRound, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Card, Field, PageHeader } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { changePassword, removePasskey, revokeMySession, revokeOtherSessions } from "./actions";
import { AddPasskeyButton, RecoveryCodesForm } from "./SecurityForms";

export const metadata = { title: "Mi cuenta y seguridad" };

export default async function SecurityPage() {
  const admin = await requireAdmin();
  const [user, sessions, passkeys, activity] = await Promise.all([
    db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { totpEnabledAt: true, recoveryCodes: true, passwordChangedAt: true, lastLoginAt: true } }),
    db.adminSession.findMany({
      where: { userId: admin.id, revokedAt: null, mfaVerified: true, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, deviceLabel: true, createdAt: true, lastSeenAt: true },
    }),
    db.adminPasskey.findMany({ where: { userId: admin.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, createdAt: true, lastUsedAt: true, backedUp: true } }),
    db.auditLog.findMany({
      where: { actorId: admin.id, action: { startsWith: "auth." } },
      orderBy: { seq: "desc" },
      take: 10,
      select: { action: true, createdAt: true, details: true },
    }),
  ]);
  const onlyFactor = !user.totpEnabledAt && passkeys.length <= 1;

  return (
    <>
      <PageHeader title="Mi cuenta y seguridad" description={`${admin.email} · ${ROLE_LABEL[admin.role]}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Contraseña">
          <ActionForm action={changePassword} className="space-y-3" resetOnSuccess>
            <Field label="Contraseña actual">
              <input type="password" name="current" required autoComplete="current-password" className="input" />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 12 caracteres. Mejor una frase de varias palabras que no uses en otro sitio.">
              <input type="password" name="next" required minLength={12} maxLength={200} autoComplete="new-password" className="input" />
            </Field>
            <Field label="Repite la nueva contraseña">
              <input type="password" name="confirm" required minLength={12} maxLength={200} autoComplete="new-password" className="input" />
            </Field>
            <SubmitButton className="btn-dark btn-sm">Cambiar contraseña</SubmitButton>
            <p className="text-xs text-cocoa-500">Último cambio: {formatDateTime(user.passwordChangedAt)}</p>
          </ActionForm>
        </Card>

        <Card title="Verificación en dos pasos">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-700" /> App de autenticación:{" "}
              {user.totpEnabledAt ? <Badge className="bg-emerald-100 text-emerald-900">Activada</Badge> : <Badge className="bg-stone-200 text-stone-700">No configurada</Badge>}
            </li>
            <li className="flex items-center gap-2">
              <KeyRound className="size-4 text-emerald-700" /> Códigos de recuperación disponibles: <strong>{user.recoveryCodes.length}</strong>
            </li>
          </ul>
          <h3 className="mt-5 font-semibold">Passkeys y llaves de seguridad</h3>
          <p className="text-sm text-cocoa-600">Son la opción más segura: no se pueden robar con webs falsas (phishing).</p>
          <ul className="my-3 space-y-2">
            {passkeys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 rounded-xl bg-cream-50 px-3 py-2 text-sm">
                <span>
                  <strong>{k.name}</strong>
                  <span className="block text-xs text-cocoa-500">
                    Añadida {formatDateTime(k.createdAt)}
                    {k.lastUsedAt ? ` · usada ${formatDateTime(k.lastUsedAt)}` : ""}
                  </span>
                </span>
                {!onlyFactor && (
                  <form action={removePasskey}>
                    <input type="hidden" name="id" value={k.id} />
                    <button className="btn-ghost size-9 p-0" aria-label={`Quitar ${k.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <AddPasskeyButton />
          <h3 className="mt-5 mb-2 font-semibold">Códigos de recuperación</h3>
          <RecoveryCodesForm />
        </Card>

        <Card title="Sesiones abiertas">
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-cream-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <MonitorSmartphone className="size-4" />
                  <span>
                    <strong>{s.deviceLabel ?? "Navegador"}</strong> {s.id === admin.sessionId && <Badge className="bg-emerald-100 text-emerald-900">Esta</Badge>}
                    <span className="block text-xs text-cocoa-500">
                      Inicio {formatDateTime(s.createdAt)} · última actividad {formatDateTime(s.lastSeenAt)}
                    </span>
                  </span>
                </span>
                {s.id !== admin.sessionId && (
                  <form action={revokeMySession}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="btn-ghost btn-sm text-red-700">Cerrar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <form action={revokeOtherSessions} className="mt-3">
              <button className="btn-outline btn-sm">Cerrar todas las demás sesiones</button>
            </form>
          )}
        </Card>

        <Card title="Actividad reciente de tu cuenta">
          <ul className="space-y-1 text-sm">
            {activity.map((a, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{a.action.replace("auth.", "")}</span>
                <span className="text-cocoa-500">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cocoa-500">Si ves algo que no reconoces, cambia la contraseña y cierra las demás sesiones.</p>
        </Card>
      </div>
    </>
  );
}
