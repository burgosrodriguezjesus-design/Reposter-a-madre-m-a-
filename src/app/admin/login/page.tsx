import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { BrandMark } from "@/components/icons";
import { getAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Acceso al panel", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getAdmin()) redirect("/admin");
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="size-14" />
          <h1 className="mt-3 font-display text-3xl text-cocoa-900">Panel de gestión</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-cocoa-500">
            <Lock className="size-3.5" /> Acceso privado
          </p>
        </div>
        <LoginForm next={safeNext} />
      </div>
    </div>
  );
}
