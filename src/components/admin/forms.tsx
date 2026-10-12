"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import clsx from "clsx";

export type ActionResult = { ok: boolean; message?: string; error?: string } | null;

export function SubmitButton({ children, className, pendingText = "Guardando…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx(className ?? "btn-primary")}>
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {pending ? pendingText : children}
    </button>
  );
}

export function ResultMessage({ result }: { result: ActionResult }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <CheckCircle2 className="size-4" /> {result.message ?? "Guardado"}
    </p>
  ) : (
    <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
      <TriangleAlert className="size-4" /> {result.error ?? "No se pudo guardar"}
    </p>
  );
}

/** Formulario conectado a una Server Action que muestra el resultado. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [result, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (result?.ok && resetOnSuccess) ref.current?.reset();
  }, [result, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="mt-3">
        <ResultMessage result={result} />
      </div>
    </form>
  );
}

/** Botón que pide confirmación antes de enviar. */
export function ConfirmButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className ?? "btn-outline btn-sm"}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Refresca los datos cada cierto tiempo (p. ej. para ver pedidos nuevos). */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Campo de importe en euros que envía céntimos. */
export function MoneyInput({ name, defaultValue, required, placeholder }: { name: string; defaultValue?: number | null; required?: boolean; placeholder?: string }) {
  const [value, setValue] = useState(defaultValue != null ? (defaultValue / 100).toFixed(2).replace(".", ",") : "");
  const cents = Math.round(Number.parseFloat(value.replace(",", ".")) * 100);
  return (
    <div className="relative">
      <input
        className="input pr-8"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ""))}
        required={required}
        placeholder={placeholder ?? "0,00"}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-cocoa-500">€</span>
      <input type="hidden" name={name} value={Number.isFinite(cents) ? cents : ""} />
    </div>
  );
}
