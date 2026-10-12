"use client";

import Link from "next/link";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-24 text-center">
      <h1 className="font-display text-4xl text-cocoa-900">Vaya, algo se ha quemado en el horno</h1>
      <p className="mx-auto mt-3 max-w-md text-cocoa-600">Ha ocurrido un error inesperado. Inténtalo de nuevo o escríbenos si el problema continúa.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Reintentar
        </button>
        <Link href="/" className="btn-outline">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
