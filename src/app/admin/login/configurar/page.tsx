import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasSecondFactor, pendingTotpSecret } from "@/lib/mfa";
import { AuthShell } from "../AuthShell";
import { PasskeySetup, TotpSetup } from "../MfaForms";
import { finishEnrollment, logout } from "../actions";

export const metadata: Metadata = { title: "Activa la verificación en dos pasos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Primer acceso: el segundo factor es obligatorio para todos los usuarios del panel. */
export default async function SetupMfaPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.mfaVerified) redirect("/admin");
  if (session.challenge === "enrolled") {
    return (
      <AuthShell title="Segundo factor activado">
        <form action={finishEnrollment} className="card p-6">
          <button className="btn-primary w-full">Entrar al panel</button>
        </form>
      </AuthShell>
    );
  }
  if (await hasSecondFactor(session.userId, session.user.totpEnabledAt)) redirect("/admin/login/verificar");
  const { secret, qrDataUrl } = await pendingTotpSecret(session);
  return (
    <AuthShell title="Protege tu cuenta" subtitle="Paso obligatorio la primera vez">
      <div className="card space-y-5 p-6">
        <p className="text-sm text-cocoa-700">
          Para entrar al panel necesitas, además de la contraseña, un segundo factor. Así nadie puede acceder aunque averigüe tu contraseña.
        </p>
        <PasskeySetup />
        <p className="text-center text-xs text-cocoa-500">o con una app de autenticación</p>
        <TotpSetup qrDataUrl={qrDataUrl} secret={secret} />
      </div>
      <form action={logout} className="mt-4 text-center">
        <button className="text-sm text-cocoa-600 underline">Cancelar</button>
      </form>
    </AuthShell>
  );
}
