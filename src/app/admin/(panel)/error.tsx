"use client";

import Link from "next/link";

/** Error en una pantalla del panel: el resto del panel sigue funcionando (sin detalles técnicos). */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-3xl text-cocoa-900">No se ha podido cargar esta pantalla</h1>
      <p className="mt-3 text-cocoa-600">
        Puede ser un fallo momentáneo de conexión. Vuelve a intentarlo; si continúa, revisa el registro de actividad.
        {error.digest && <span className="mt-2 block text-xs text-cocoa-500">Referencia del error: {error.digest}</span>}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Reintentar
        </button>
        <Link href="/admin" className="btn-outline">
          Ir al inicio del panel
        </Link>
      </div>
    </div>
  );
}
