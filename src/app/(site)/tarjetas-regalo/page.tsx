import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/site/ui";
import { GiftCardForm } from "@/components/site/GiftCardForm";
import { getSettings } from "@/lib/settings";
import { paymentOptions } from "@/lib/checkout";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getSettings();
  return {
    title: "Tarjetas regalo digitales",
    description: `Regala una tarjeta de ${business.name} en ${business.city}: la reciben por email al momento y la pueden usar en tartas, cupcakes y dulces.`,
    alternates: { canonical: "/tarjetas-regalo" },
  };
}

export default async function GiftCardsPage({ searchParams }: PageProps<"/tarjetas-regalo">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const m = settings.marketing;

  return (
    <div className="container-page py-10 sm:py-14">
      <Breadcrumbs items={[{ name: "Tarjetas regalo", path: "/tarjetas-regalo" }]} />
      <header className="mt-6 max-w-3xl">
        <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Regala un momento dulce</h1>
        <p className="mt-3 text-lg text-cocoa-600">
          Tarjetas regalo digitales válidas durante {m.giftCardValidityMonths} meses para cualquier producto de la web o de la tienda. Se
          pueden usar en varios pedidos hasta agotar el saldo.
        </p>
      </header>
      {params.ok === "1" && (
        <p className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <CircleCheck className="size-5" /> ¡Pago recibido! Te hemos enviado la tarjeta por email (revisa también la carpeta de spam).
        </p>
      )}
      {params.cancelado === "1" && <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-amber-900">El pago no se completó y no se te ha cobrado nada.</p>}
      <div className="mt-10">
        {m.giftCardsEnabled ? (
          <GiftCardForm amounts={m.giftCardAmounts} payments={paymentOptions(settings)} businessName={settings.business.name} />
        ) : (
          <p className="rounded-3xl bg-white p-8 text-cocoa-700 shadow-soft">Las tarjetas regalo no están disponibles en este momento.</p>
        )}
      </div>
    </div>
  );
}
