import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { accessCookieName } from "@/lib/access-token";
import { PackageSearch } from "lucide-react";
import { db } from "@/lib/db";
import { emailHash, safeEqual } from "@/lib/crypto";
import { limitByIp } from "@/lib/rate-limit";

export const metadata: Metadata = {
  title: "Seguir mi pedido",
  description: "Consulta el estado de tu pedido con el número de pedido y tu email.",
  alternates: { canonical: "/seguimiento" },
};

async function lookup(formData: FormData) {
  "use server";
  const number = String(formData.get("number") ?? "").trim().toUpperCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!(await limitByIp("tracking", 15, 10 * 60_000))) redirect("/seguimiento?error=limite");
  const order =
    number && email ? await db.order.findUnique({ where: { number }, select: { number: true, accessToken: true, customerEmailHash: true } }) : null;
  // Misma respuesta si el pedido no existe o el email no coincide (no revela qué pedidos existen).
  if (!order || !safeEqual(order.customerEmailHash, emailHash(email))) redirect("/seguimiento?error=1");
  // El token se guarda en una cookie privada de esa página en lugar de ir en la URL
  const jar = await cookies();
  jar.set(accessCookieName("pedido", order.number), order.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/pedido/${order.number}`,
    maxAge: 90 * 86_400,
  });
  redirect(`/pedido/${order.number}`);
}

export default async function TrackingPage({ searchParams }: PageProps<"/seguimiento">) {
  const { error } = await searchParams;
  return (
    <div className="container-page max-w-xl py-14">
      <PackageSearch className="size-12 text-blush-500" strokeWidth={1.5} />
      <h1 className="mt-4 font-display text-4xl text-cocoa-900">Seguir mi pedido</h1>
      <p className="mt-3 text-cocoa-600">
        Introduce el número de pedido (lo encontrarás en el email de confirmación, empieza por «MM-») y el email con el que lo hiciste.
      </p>
      <form action={lookup} className="card mt-8 space-y-4 p-6">
        <div>
          <label htmlFor="number" className="label">
            Número de pedido
          </label>
          <input id="number" name="number" required className="input uppercase" placeholder="MM-XXXXXX" />
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        {error && (
          <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error === "limite" ? "Demasiados intentos. Espera unos minutos." : "No encontramos ningún pedido con esos datos. Revísalos e inténtalo de nuevo."}
          </p>
        )}
        <button type="submit" className="btn-primary w-full">
          Consultar estado
        </button>
      </form>
    </div>
  );
}
