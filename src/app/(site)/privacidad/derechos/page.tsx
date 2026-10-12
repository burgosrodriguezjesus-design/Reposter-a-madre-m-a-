import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { requestRights } from "./actions";

export const metadata: Metadata = {
  title: "Ejercer mis derechos de protección de datos",
  description: "Solicita el acceso, la rectificación, la supresión o la portabilidad de tus datos personales.",
  alternates: { canonical: "/privacidad/derechos" },
};
export const dynamic = "force-dynamic";

export default async function RightsPage({ searchParams }: PageProps<"/privacidad/derechos">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const errors: Record<string, string> = { limite: "Has hecho demasiadas solicitudes. Inténtalo más tarde.", datos: "Revisa el email y el tipo de solicitud." };
  return (
    <div className="container-page max-w-2xl py-14">
      <ShieldCheck className="size-12 text-blush-500" strokeWidth={1.5} />
      <h1 className="mt-4 font-display text-4xl text-cocoa-900">Tus datos, tus derechos</h1>
      <p className="mt-3 text-cocoa-600">
        Puedes pedirnos una copia de tus datos, corregirlos, borrarlos, llevártelos o limitar su uso. Para proteger tu privacidad te enviaremos un enlace
        de confirmación al email indicado. Respondemos en un plazo máximo de un mes. También puedes escribir a {settings.business.email}.
      </p>
      {params.enviado === "1" ? (
        <div className="card mt-8 p-8 text-center">
          <p className="font-display text-2xl text-cocoa-900">Revisa tu correo</p>
          <p className="mt-2 text-cocoa-600">Si el email es correcto, recibirás un enlace para confirmar la solicitud (caduca en 7 días).</p>
        </div>
      ) : (
        <form action={requestRights} className="card mt-8 space-y-4 p-6">
          {typeof params.error === "string" && errors[params.error] && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {errors[params.error]}
            </p>
          )}
          <label className="block">
            <span className="label">¿Qué quieres hacer?</span>
            <select name="type" className="input" required defaultValue="ACCESS">
              <option value="ACCESS">Saber qué datos tenéis de mí (acceso)</option>
              <option value="PORTABILITY">Recibir mis datos en un archivo (portabilidad)</option>
              <option value="RECTIFICATION">Corregir mis datos (rectificación)</option>
              <option value="ERASURE">Borrar mis datos (supresión)</option>
              <option value="OBJECTION">Que no uséis mis datos para publicidad (oposición)</option>
              <option value="RESTRICTION">Limitar el uso de mis datos (limitación)</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Email con el que hiciste tus pedidos</span>
            <input name="email" type="email" required maxLength={160} autoComplete="email" className="input" />
          </label>
          <label className="block">
            <span className="label">Detalles (opcional)</span>
            <textarea name="details" maxLength={2000} rows={3} className="input" placeholder="Por ejemplo, qué dato hay que corregir" />
          </label>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <button type="submit" className="btn-primary w-full">
            Enviar solicitud
          </button>
        </form>
      )}
    </div>
  );
}
