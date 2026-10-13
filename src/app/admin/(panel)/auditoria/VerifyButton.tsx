"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { verifyChain } from "./actions";

export function VerifyButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => start(async () => setResult(await verifyChain()))}>
        <ShieldCheck className="size-4" /> {pending ? "Verificando…" : "Verificar integridad"}
      </button>
      {result && <span className={`text-sm ${result.ok ? "text-emerald-800" : "font-semibold text-red-700"}`}>{result.message}</span>}
    </div>
  );
}
