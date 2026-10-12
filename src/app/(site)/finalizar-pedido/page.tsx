import type { Metadata } from "next";
import { CheckoutForm } from "@/components/site/checkout/CheckoutForm";
import { getSettings } from "@/lib/settings";
import { paymentOptions } from "@/lib/checkout";
import { getDeliveryZones } from "@/lib/catalog";
import { fullAddress } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: PageProps<"/finalizar-pedido">) {
  const [settings, zones, params] = await Promise.all([getSettings(), getDeliveryZones(), searchParams]);
  const o = settings.ordering;
  const cancelled = typeof params.cancelado === "string" ? params.cancelado : null;

  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Finalizar pedido</h1>
      {cancelled && (
        <p className="mt-6 rounded-2xl bg-amber-50 p-4 text-amber-900">
          El pago del pedido {cancelled} no se completó y no se te ha cobrado nada. Tu carrito sigue aquí: puedes intentarlo de
          nuevo o elegir otra forma de pago.
        </p>
      )}
      {!o.onlineOrdersEnabled ? (
        <p className="mt-8 rounded-3xl bg-white p-8 text-lg text-cocoa-700 shadow-soft">{o.closedMessage}</p>
      ) : (
        <CheckoutForm
          config={{
            pickupEnabled: o.pickupEnabled,
            deliveryEnabled: o.deliveryEnabled && zones.length > 0,
            deliveryInfo: o.deliveryInfo,
            payments: paymentOptions(settings),
            storeAddress: fullAddress(settings.business),
            businessCity: settings.business.city,
            zones: zones.map((z) => ({ name: z.name, postalCodes: z.postalCodes })),
            cancellationSummary: o.cancellationSummary,
            allergenNotice: o.allergenNotice,
            abandonedCartEnabled: settings.marketing.abandonedCartEnabled,
          }}
        />
      )}
    </div>
  );
}
