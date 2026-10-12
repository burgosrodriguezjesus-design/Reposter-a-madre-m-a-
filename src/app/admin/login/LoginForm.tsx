"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/forms";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="username" className="input" />
      </label>
      <label className="block">
        <span className="label">Contraseña</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn-primary w-full" pendingText="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}
