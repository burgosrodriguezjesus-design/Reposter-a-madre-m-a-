"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { SubmitButton } from "@/components/admin/forms";
import { confirmMfaSetup, finishEnrollment, verifyMfa } from "./actions";

function ErrorBox({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
      {error}
    </p>
  );
}

async function webauthn(action: string, body?: unknown) {
  const res = await fetch("/api/admin/webauthn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body ? { response: body } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; options?: never; redirect?: string; ok?: boolean };
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

export function CodeForm() {
  const [state, action] = useActionState(verifyMfa, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Código de verificación</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={20}
          className="input text-center font-mono text-2xl tracking-[0.3em]"
          placeholder="123456"
          autoFocus
        />
        <span className="mt-1 block text-xs text-cocoa-500">De tu app de autenticación, o uno de tus códigos de recuperación.</span>
      </label>
      <ErrorBox error={state?.error} />
      <SubmitButton className="btn-primary w-full" pendingText="Verificando…">
        Verificar y entrar
      </SubmitButton>
    </form>
  );
}

export function PasskeyLogin() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { options } = await webauthn("auth-options");
      const response = await startAuthentication({ optionsJSON: options! });
      const result = await webauthn("auth-verify", response);
      window.location.assign(result.redirect ?? "/admin");
    } catch (e) {
      setError(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "No se pudo usar la llave. Inténtalo de nuevo.");
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={run} disabled={busy} className="btn-outline w-full">
        <KeyRound className="size-4" /> {busy ? "Esperando a la llave…" : "Usar passkey o llave de seguridad"}
      </button>
      <ErrorBox error={error} />
    </div>
  );
}

export function TotpSetup({ qrDataUrl, secret }: { qrDataUrl: string; secret: string }) {
  const [state, action] = useActionState(confirmMfaSetup, null);
  if (state?.codes) return <RecoveryCodes codes={state.codes} finish />;
  return (
    <form action={action} className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-cocoa-700">
        <li>Instala una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…).</li>
        <li>Escanea este código QR con la app.</li>
        <li>Escribe el código de 6 cifras que te muestra.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUrl} alt="Código QR para la app de autenticación" width={200} height={200} className="mx-auto rounded-xl bg-white p-2" />
      <details className="text-xs text-cocoa-600">
        <summary className="cursor-pointer">¿No puedes escanear? Introduce la clave a mano</summary>
        <code className="mt-2 block break-all rounded-lg bg-cream-100 p-2 font-mono text-sm">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
      </details>
      <input
        name="code"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        className="input text-center font-mono text-2xl tracking-[0.3em]"
        placeholder="123456"
      />
      <ErrorBox error={state?.error} />
      <SubmitButton className="btn-primary w-full" pendingText="Comprobando…">
        Activar y entrar
      </SubmitButton>
    </form>
  );
}

export function PasskeySetup() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { options } = await webauthn("register-options");
      const response = await startRegistration({ optionsJSON: options! });
      const result = await webauthn("register-verify", { ...response, name: navigator.platform || "Passkey" });
      window.location.assign(result.redirect ?? "/admin");
    } catch (e) {
      setError(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "No se pudo registrar la llave.");
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={run} disabled={busy} className="btn-outline w-full">
        <KeyRound className="size-4" /> {busy ? "Esperando a la llave…" : "Usar una passkey o llave de seguridad"}
      </button>
      <ErrorBox error={error} />
    </div>
  );
}

export function RecoveryCodes({ codes, finish = false }: { codes: string[]; finish?: boolean }) {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 font-semibold text-emerald-800">
        <ShieldCheck className="size-5" /> Segundo factor activado
      </p>
      <p className="text-sm text-cocoa-700">
        Guarda estos <strong>códigos de recuperación</strong> en un lugar seguro (gestor de contraseñas o papel). Cada uno sirve una sola vez si pierdes el
        móvil. <strong>No se volverán a mostrar.</strong>
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-cream-100 p-3 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {finish ? (
        <form action={finishEnrollment}>
          <SubmitButton className="btn-primary w-full" pendingText="Entrando…">
            Ya los he guardado, entrar
          </SubmitButton>
        </form>
      ) : (
        <Link href="/admin/seguridad" className="btn-primary w-full">
          Ya los he guardado
        </Link>
      )}
    </div>
  );
}
