"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/forms";
import { createUser, updateUser } from "./actions";

function Message({ state }: { state: { ok: boolean; message?: string; error?: string; password?: string } | null }) {
  if (!state) return null;
  return (
    <div role={state.ok ? "status" : "alert"} className={`mt-2 rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
      {state.ok ? state.message : state.error}
      {state.password && <code className="mt-2 block break-all rounded-lg bg-white p-2 font-mono text-base">{state.password}</code>}
    </div>
  );
}

export function NewUserForm() {
  const [state, action] = useActionState(createUser, null);
  return (
    <form action={action} className="space-y-2">
      <input name="name" required placeholder="Nombre" className="input" maxLength={80} />
      <input name="email" type="email" required placeholder="Email" className="input" maxLength={160} />
      <select name="role" className="input" defaultValue="STAFF">
        <option value="STAFF">Empleado — pedidos y calendario</option>
        <option value="MANAGER">Encargado — también catálogo, precios y marketing</option>
        <option value="OWNER">Propietario — acceso total</option>
      </select>
      <SubmitButton className="btn-dark btn-sm" pendingText="Creando…">
        Crear usuario
      </SubmitButton>
      <Message state={state} />
    </form>
  );
}

export function UserActions({ id, role, active, locked }: { id: string; role: string; active: boolean; locked: boolean }) {
  const [state, action] = useActionState(updateUser, null);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="intent" value="role" />
        <select name="role" defaultValue={role} className="input h-9 w-auto py-1 text-sm" aria-label="Rol">
          <option value="STAFF">Empleado</option>
          <option value="MANAGER">Encargado</option>
          <option value="OWNER">Propietario</option>
        </select>
        <SubmitButton className="btn-outline btn-sm">Cambiar rol</SubmitButton>
      </form>
      <div className="flex flex-wrap gap-2">
        {[
          active ? { intent: "deactivate", label: "Desactivar", confirm: "¿Quitar el acceso a este usuario? Se cerrarán sus sesiones." } : { intent: "activate", label: "Reactivar" },
          { intent: "reset-mfa", label: "Restablecer 2FA", confirm: "Úsalo solo si ha perdido su móvil o llave. Deberá configurarlo de nuevo." },
          { intent: "sessions", label: "Cerrar sesiones" },
          ...(locked ? [{ intent: "unlock", label: "Desbloquear" }] : []),
        ].map((b) => (
          <form
            key={b.intent}
            action={action}
            onSubmit={(e) => {
              if ("confirm" in b && b.confirm && !window.confirm(b.confirm)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value={b.intent} />
            <button className="btn-ghost btn-sm">{b.label}</button>
          </form>
        ))}
      </div>
      <Message state={state} />
    </div>
  );
}
