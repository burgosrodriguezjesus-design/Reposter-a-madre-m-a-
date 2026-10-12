"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { SubmitButton } from "@/components/admin/forms";
import { newRecoveryCodes } from "./actions";

export function RecoveryCodesForm() {
  const [state, action] = useActionState(newRecoveryCodes, null);
  if (state?.codes) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-cocoa-700">Guarda estos códigos nuevos. Los anteriores ya no sirven. No se volverán a mostrar.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-cream-100 p-3 font-mono text-sm">
          {state.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex-1">
        <span className="label">Confirma con tu contraseña</span>
        <input type="password" name="password" required autoComplete="current-password" className="input" />
      </label>
      <SubmitButton className="btn-outline btn-sm" pendingText="Generando…">
        Generar códigos nuevos
      </SubmitButton>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

export function AddPasskeyButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function call(action: string, response?: unknown) {
    const res = await fetch("/api/admin/webauthn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, response }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Error");
    return data;
  }
  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const { options } = await call("register-options");
      const response = await startRegistration({ optionsJSON: options });
      const name = window.prompt("Nombre para esta llave (p. ej. «iPhone de Ana» o «YubiKey»)", "Passkey") ?? "Passkey";
      await call("register-verify", { ...response, name });
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "No se pudo añadir la llave");
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={add} disabled={busy} className="btn-outline btn-sm">
        <KeyRound className="size-4" /> {busy ? "Esperando a la llave…" : "Añadir passkey o llave de seguridad"}
      </button>
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
