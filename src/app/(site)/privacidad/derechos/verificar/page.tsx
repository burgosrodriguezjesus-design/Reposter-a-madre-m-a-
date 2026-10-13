import type { Metadata } from "next";
import { confirmRights } from "../actions";

export const metadata: Metadata = { title: "Confirmar solicitud de datos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Se confirma con un botón (no al abrir el enlace) para que los antivirus de correo no la validen solos. */
export default async function VerifyRightsPage({ searchParams }: PageProps<"/privacidad/derechos/verificar">) {
  const params = await searchParams;
  return (
    <div className="container-page max-w-xl py-16 text-center">
      <h1 className="font-display text-4xl text-cocoa-900">Confirmar solicitud</h1>
      {params.ok === "1" ? (
        <p className="mt-4 text-cocoa-600">Solicitud confirmada. La atenderemos en un plazo máximo de un mes y te responderemos por email.</p>
      ) : params.error === "1" ? (
        <p className="mt-4 text-red-700">El enlace no es válido o ha caducado. Puedes hacer una nueva solicitud.</p>
      ) : (
        <form action={confirmRights} className="mt-6">
          <input type="hidden" name="t" value={typeof params.t === "string" ? params.t : ""} />
          <button className="btn-primary">Sí, confirmo mi solicitud</button>
        </form>
      )}
    </div>
  );
}
