"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

/**
 * Mapa de Google que solo se carga al pulsar (no instala cookies de terceros
 * sin acción del usuario y no penaliza la velocidad de carga).
 */
export function MapEmbed({ src, title }: { src: string; title: string }) {
  const [load, setLoad] = useState(false);
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-sand-300/70 bg-cream-200 sm:aspect-[16/10]">
      {load ? (
        <iframe
          src={src}
          title={title}
          className="absolute inset-0 size-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_30%_30%,#F6D9DE,transparent_55%),radial-gradient(circle_at_70%_70%,#F1E4C3,transparent_50%)] p-6 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-white shadow-soft">
            <MapPin className="size-7 text-blush-600" />
          </span>
          <button type="button" className="btn-dark btn-sm" onClick={() => setLoad(true)}>
            Ver mapa interactivo
          </button>
          <p className="max-w-xs text-xs text-cocoa-600">Al cargar el mapa, Google puede instalar sus propias cookies.</p>
        </div>
      )}
    </div>
  );
}
