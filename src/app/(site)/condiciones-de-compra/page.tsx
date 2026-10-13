import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { getSettings } from "@/lib/settings";
import { paymentOptions } from "@/lib/checkout";
import { fullAddress } from "@/lib/structured-data";

export const metadata: Metadata = { title: "Condiciones de compra", alternates: { canonical: "/condiciones-de-compra" } };

export default async function TermsPage() {
  const settings = await getSettings();
  const { business: b, ordering: o, marketing: m } = settings;
  const payments = paymentOptions(settings);
  return (
    <LegalPage title="Condiciones de compra" path="/condiciones-de-compra">
      <p>
        Estas condiciones regulan los pedidos realizados en la web de {b.name}, titularidad de {b.legalName}{b.taxId ? ` (NIF ${b.taxId})` : ""}, con domicilio
        en {fullAddress(b)}.
      </p>
      <h2>1. Productos y precios</h2>
      <p>
        Todos los productos son de elaboración artesanal y se preparan por encargo. Los precios incluyen el IVA. Las fotografías son
        orientativas. El precio aplicable es el que figura en el momento de confirmar el pedido. Los gastos de envío, si los hay, se
        muestran antes del pago.
      </p>
      <h2>2. Proceso de pedido</h2>
      <p>
        Eliges los productos, la fecha y la hora de recogida o entrega entre las disponibles, introduces tus datos y la forma de pago y
        confirmas. Recibirás un email con el número de pedido. Los pedidos que incluyen personalizaciones (dedicatorias, fotografías,
        diseños) quedan pendientes de nuestra revisión y te confirmaremos su aceptación por email; si no pudiéramos realizarlos, te
        devolveremos íntegramente cualquier importe abonado.
      </p>
      <h2>3. Antelación y disponibilidad</h2>
      <p>
        Cada producto indica la antelación mínima necesaria (con carácter general, {o.minLeadHours} horas). El sistema no permite elegir días
        u horas sin disponibilidad. Podemos limitar el número de pedidos por día o franja para garantizar la calidad.
      </p>
      <h2>4. Pago</h2>
      <p>
        {payments.card
          ? "Puedes pagar online con tarjeta mediante Stripe (pago seguro; no almacenamos los datos de tu tarjeta) o reservar y pagar al recoger en tienda."
          : "No se paga nada en la web: reservas tu pedido online y lo pagas al recogerlo en nuestro puesto, en efectivo o con tarjeta."}{" "}
        {m.giftCardsEnabled ? "También se aceptan tarjetas regalo, válidas durante el plazo indicado en ellas." : ""}
      </p>
      <h2>5. Recogida{o.deliveryEnabled ? " y entrega" : ""}</h2>
      <p>
        La recogida se realiza en nuestro establecimiento en la fecha y hora elegidas.{" "}
        {o.deliveryEnabled
          ? "Las entregas a domicilio se realizan en las zonas indicadas en la web; la hora es aproximada. Si no hay nadie para recibir el pedido, contactaremos contigo para reprogramar la entrega, lo que podría suponer un nuevo coste de envío."
          : "No realizamos envíos a domicilio."}{" "}
        Los productos deben conservarse refrigerados cuando así se indique.
      </p>
      <h2>6. Desistimiento, cancelaciones y devoluciones</h2>
      <p>
        De acuerdo con el artículo 103 del Real Decreto Legislativo 1/2007 (TRLGDCU), el derecho de desistimiento no es aplicable a
        productos que puedan deteriorarse o caducar con rapidez ni a los confeccionados conforme a las especificaciones del consumidor.
        No obstante, ofrecemos la siguiente política de cancelación: {o.cancellationSummary} Consulta los detalles en nuestra{" "}
        <Link href="/cancelaciones">política de cancelaciones</Link>.
      </p>
      <h2>7. Alérgenos</h2>
      <p>
        La información sobre ingredientes y alérgenos está disponible en cada producto y en nuestra <Link href="/alergenos">página de alérgenos</Link>.{" "}
        {o.allergenNotice}
      </p>
      <h2>8. Reclamaciones</h2>
      <p>
        Puedes contactarnos en {b.email} o {b.phone}. Disponemos de hojas de reclamaciones a tu disposición en el establecimiento. También puedes
        acudir a los servicios de consumo de tu comunidad autónoma o al sistema arbitral de consumo.
      </p>
    </LegalPage>
  );
}
