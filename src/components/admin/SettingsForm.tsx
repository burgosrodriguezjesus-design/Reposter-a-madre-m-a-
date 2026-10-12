"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { ResultMessage, type ActionResult } from "@/components/admin/forms";
import { saveSettingsSection } from "@/app/admin/(panel)/ajustes/actions";
import type { SettingsSchemaKey } from "@/lib/settings-schemas";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "money" | "boolean" | "select" | "email" | "url" | "float" | "moneyList";
  hint?: string;
  options?: { value: string; label: string }[];
  full?: boolean;
  placeholder?: string;
  maxLength?: number;
};

type Values = Record<string, unknown>;

function toEuros(cents: unknown) {
  return typeof cents === "number" ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

export function SettingsForm({ section, fields, initial, submitLabel = "Guardar" }: { section: SettingsSchemaKey; fields: FieldDef[]; initial: Values; submitLabel?: string }) {
  // Valores de texto tal y como se escriben; se convierten al guardar
  const [raw, setRaw] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      fields.map((f) => {
        const v = initial[f.name];
        if (f.type === "boolean") return [f.name, !!v];
        if (f.type === "money") return [f.name, toEuros(v)];
        if (f.type === "moneyList") return [f.name, Array.isArray(v) ? v.map((c) => toEuros(c).replace(",00", "")).join(", ") : ""];
        return [f.name, v == null ? "" : String(v)];
      }),
    ),
  );
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();

  function convert(): Values {
    const out: Values = {};
    for (const f of fields) {
      const v = raw[f.name];
      switch (f.type) {
        case "boolean":
          out[f.name] = !!v;
          break;
        case "number":
          out[f.name] = Math.round(Number(v) || 0);
          break;
        case "float":
          out[f.name] = String(v).trim() === "" ? null : Number(String(v).replace(",", "."));
          break;
        case "money":
          out[f.name] = Math.round(Number(String(v).replace(",", ".")) * 100) || 0;
          break;
        case "moneyList":
          out[f.name] = String(v)
            .split(/[;\s]+|,(?=\s)/)
            .map((x) => Math.round(Number(x.replace(",", ".")) * 100))
            .filter((x) => Number.isFinite(x) && x > 0);
          break;
        default:
          out[f.name] = String(v ?? "").trim();
      }
    }
    return out;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await saveSettingsSection(section, convert())));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${section}-${f.name}`;
          if (f.type === "boolean") {
            return (
              <label key={f.name} className="flex items-start gap-3 rounded-xl border border-sand-300/70 bg-cream-50 p-3 text-sm sm:col-span-2">
                <input id={id} type="checkbox" checked={!!raw[f.name]} onChange={(e) => setRaw({ ...raw, [f.name]: e.target.checked })} className="mt-0.5 size-4 accent-blush-600" />
                <span>
                  <span className="font-medium text-cocoa-900">{f.label}</span>
                  {f.hint && <span className="block text-xs text-cocoa-500">{f.hint}</span>}
                </span>
              </label>
            );
          }
          const common = {
            id,
            className: "input",
            value: String(raw[f.name] ?? ""),
            placeholder: f.placeholder,
            maxLength: f.maxLength,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setRaw({ ...raw, [f.name]: e.target.value }),
          };
          return (
            <label key={f.name} htmlFor={id} className={f.full || f.type === "textarea" ? "block sm:col-span-2" : "block"}>
              <span className="label">{f.label}</span>
              {f.type === "textarea" ? (
                <textarea rows={3} {...common} />
              ) : f.type === "select" ? (
                <select {...common}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "money" ? (
                <div className="relative">
                  <input inputMode="decimal" {...common} className="input pr-8" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-cocoa-500">€</span>
                </div>
              ) : (
                <input
                  type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                  inputMode={f.type === "float" ? "decimal" : undefined}
                  {...common}
                />
              )}
              {f.hint && <span className="mt-1 block text-xs text-cocoa-500">{f.hint}</span>}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin" />} {submitLabel}
        </button>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
