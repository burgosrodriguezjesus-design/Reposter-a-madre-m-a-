import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuthShell } from "../AuthShell";
import { CodeForm, PasskeyLogin } from "../MfaForms";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Verificación en dos pasos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.mfaVerified) redirect("/admin");
  const passkeys = await db.adminPasskey.count({ where: { userId: session.userId } });
  if (!session.user.totpEnabledAt && passkeys === 0) redirect("/admin/login/configurar");
  return (
    <AuthShell title="Verificación en dos pasos" subtitle={session.user.email}>
      <div className="card space-y-5 p-6">
        {passkeys > 0 && <PasskeyLogin />}
        {passkeys > 0 && session.user.totpEnabledAt && <p className="text-center text-xs text-cocoa-500">o bien</p>}
        {(session.user.totpEnabledAt || session.user.recoveryCodes.length > 0) && <CodeForm />}
      </div>
      <form action={logout} className="mt-4 text-center">
        <button className="text-sm text-cocoa-600 underline">Cancelar y volver</button>
      </form>
    </AuthShell>
  );
}
