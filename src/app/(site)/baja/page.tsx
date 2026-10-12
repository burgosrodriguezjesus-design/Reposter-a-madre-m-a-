import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Darse de baja", robots: { index: false, follow: false } };

/** Baja de comunicaciones: marketing, recordatorios de celebraciones y de carrito. */
async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("t") ?? "");
  if (token.startsWith("c-")) {
    await db.abandonedCart.deleteMany({ where: { token: token.slice(2) } });
  } else if (token) {
    const customer = await db.customer.findUnique({ where: { unsubscribeToken: token } });
    if (customer) {
      await db.$transaction([
        db.customer.update({ where: { id: customer.id }, data: { marketingConsent: false, marketingConsentAt: null } }),
        db.celebrationReminder.updateMany({ where: { customerId: customer.id }, data: { active: false } }),
        db.abandonedCart.deleteMany({ where: { email: customer.email } }),
      ]);
    }
  }
  redirect("/baja?hecho=1");
}

export default async function UnsubscribePage({ searchParams }: PageProps<"/baja">) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : "";
  return (
    <div className="container-page max-w-xl py-16 text-center">
      <h1 className="font-display text-4xl text-cocoa-900">Darse de baja</h1>
      {params.hecho === "1" ? (
        <p className="mt-4 text-cocoa-600">Listo. No volverás a recibir comunicaciones comerciales ni recordatorios. Seguirás recibiendo los emails de tus pedidos.</p>
      ) : token ? (
        <form action={unsubscribe} className="mt-6">
          <input type="hidden" name="t" value={token} />
          <p className="text-cocoa-600">¿Quieres dejar de recibir novedades, recordatorios de celebraciones y avisos de carrito?</p>
          <button type="submit" className="btn-primary mt-6">
            Confirmar baja
          </button>
        </form>
      ) : (
        <p className="mt-4 text-cocoa-600">Enlace no válido. Escríbenos y te damos de baja manualmente.</p>
      )}
    </div>
  );
}
