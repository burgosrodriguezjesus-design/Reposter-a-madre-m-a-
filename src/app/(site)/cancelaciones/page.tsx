import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Política de cancelaciones", alternates: { canonical: "/cancelaciones" } };

export default async function CancellationPage() {
  const { business: b, ordering: o } = await getSettings();
  return (
    <LegalPage title="Política de cancelaciones" path="/cancelaciones">
      <p>{o.cancellationSummary}</p>
      <h2>Cómo cancelar o modificar un pedido</h2>
      <p>
        Escríbenos a {b.email}, por WhatsApp o llámanos al {b.phone} indicando tu número de pedido. Te confirmaremos la cancelación o el
        cambio por email.
      </p>
      <h2>Plazos</h2>
      <ul>
        <li>Dentro del plazo de cancelación gratuita indicado arriba: te devolvemos el 100 % por el mismo medio de pago.</li>
        <li>Fuera de ese plazo el producto ya está en preparación, por lo que no es posible el reembolso. Siempre que podamos, te ofreceremos un cambio de fecha.</li>
        <li>Tartas de boda y eventos: se aplican las condiciones indicadas en el presupuesto aceptado.</li>
      </ul>
      <p>
        Los productos perecederos y los elaborados según tus especificaciones están excluidos del derecho de desistimiento (art. 103 del
        TRLGDCU), por lo que esta política es una garantía adicional que te ofrecemos.
      </p>
      <h2>Si somos nosotros quienes no podemos atender el pedido</h2>
      <p>Te avisaremos lo antes posible y te devolveremos el 100 % del importe pagado por el mismo medio de pago.</p>
      <h2>Incidencias con el producto</h2>
      <p>
        Si al recoger o recibir tu pedido detectas cualquier problema, comunícanoslo en el momento o en las 24 horas siguientes con una
        fotografía y lo resolveremos.
      </p>
    </LegalPage>
  );
}
