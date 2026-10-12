import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthShell } from "./AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Acceso al panel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const session = await getSession();
  if (session?.mfaVerified) redirect("/admin");
  if (session) redirect("/admin/login/verificar");
  const { bloqueado } = await searchParams;
  return (
    <AuthShell title="Panel de gestión">
      {bloqueado === "1" && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          Se ha cerrado el acceso por demasiados códigos incorrectos. Vuelve a introducir tu contraseña.
        </p>
      )}
      <LoginForm />
      <p className="mt-4 text-center text-xs text-cocoa-500">El acceso requiere contraseña y un segundo factor (app de autenticación o llave de seguridad).</p>
    </AuthShell>
  );
}
