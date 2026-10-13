"use client";

import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useId, useState } from "react";

/** Subida de una foto de referencia/inspiración. Devuelve la URL guardada. */
export function PhotoUpload({
  value,
  onChange,
  label = "Foto de referencia (opcional)",
  hint = "JPG, PNG o HEIC, hasta 10 MB. Nos ayuda a entender tu idea.",
}: {
  value?: string;
  onChange: (url: string | undefined) => void;
  label?: string;
  hint?: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Las fotos de clientes son privadas: solo se ven con un enlace firmado temporal
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = (await res.json()) as { url?: string; previewUrl?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "No se pudo subir la imagen");
      setPreview(data.previewUrl ?? null);
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="label">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border border-sand-300 bg-white p-2 pr-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Foto de referencia subida" className="size-16 rounded-xl object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-xl bg-cream-100">
              <ImagePlus className="size-6 text-blush-600" />
            </span>
          )}
          <span className="flex-1 text-sm text-cocoa-700">Foto añadida</span>
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onChange(undefined);
            }}
            className="btn-ghost btn-sm"
            aria-label="Quitar foto"
          >
            <X className="size-4" /> Quitar
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-sand-400 bg-white/60 p-4 text-sm text-cocoa-600 transition hover:border-blush-400 hover:bg-white"
        >
          {busy ? <LoaderCircle className="size-6 animate-spin text-blush-600" /> : <ImagePlus className="size-6 text-blush-600" />}
          <span>
            <strong className="block text-cocoa-800">{busy ? "Subiendo…" : "Añadir foto"}</strong>
            {hint}
          </span>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}
