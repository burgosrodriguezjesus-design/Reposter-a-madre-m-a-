"use client";

/**
 * Último recurso: un fallo en la plantilla raíz. Sustituye a toda la página (por eso lleva su
 * propio <html>) y no depende de los estilos ni de datos: siempre se puede mostrar.
 * No enseña detalles técnicos al visitante (quedan en el registro del servidor).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f6f0eb", color: "#111110", fontFamily: "Georgia, serif", textAlign: "center", padding: "24px" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: 500 }}>Vaya, algo se ha quemado en el horno</h1>
          <p style={{ fontFamily: "system-ui, sans-serif", color: "#55524e", maxWidth: "28rem", margin: "12px auto 24px" }}>
            Ha ocurrido un error inesperado. Inténtalo de nuevo en unos segundos o escríbenos si el problema continúa.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ fontFamily: "system-ui, sans-serif", background: "#111110", color: "#fff", border: 0, padding: "12px 22px", textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}
          >
            Reintentar
          </button>
          <p style={{ fontFamily: "system-ui, sans-serif", marginTop: "16px" }}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- en un error global no se puede contar con el enrutador */}
            <a href="/" style={{ color: "#7c4637" }}>
              Ir al inicio
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
