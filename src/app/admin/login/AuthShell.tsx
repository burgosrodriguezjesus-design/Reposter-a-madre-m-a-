import { Lock } from "lucide-react";
import { BrandMark } from "@/components/icons";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="size-24" />
          <h1 className="mt-3 font-display text-3xl text-cocoa-900">{title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-cocoa-500">
            <Lock className="size-3.5" /> {subtitle ?? "Acceso privado"}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
