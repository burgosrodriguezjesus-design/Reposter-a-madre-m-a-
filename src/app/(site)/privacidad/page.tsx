import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { getSettings } from "@/lib/settings";
import { fullAddress } from "@/lib/structured-data";

export const metadata: Metadata = { title: "Política de privacidad", alternates: { canonical: "/privacidad" } };

export default async function PrivacyPage() {
  const { business: b } = await getSettings();
  return (
    <LegalPage title="Política de privacidad" path="/privacidad">
      <p>
        En {b.name} tratamos tus datos personales con transparencia y solo para lo necesario, conforme al Reglamento (UE) 2016/679 (RGPD) y
        a la Ley Orgánica 3/2018 (LOPDGDD).
      </p>
      <h2>Responsable del tratamiento</h2>
      <p>
        {b.legalName} · NIF {b.taxId} · {fullAddress(b)} · {b.email} · {b.phone}
      </p>
      <h2>Qué datos tratamos y para qué</h2>
      <ul>
        <li>
          <strong>Pedidos y presupuestos:</strong> nombre, email, teléfono, dirección de entrega, detalles del pedido y fotografías de
          referencia que nos envíes. Finalidad: gestionar tu pedido, preparar el producto, cobrar, entregarlo y atender incidencias. Base
          legal: ejecución del contrato (art. 6.1.b RGPD).
        </li>
        <li>
          <strong>Facturación y obligaciones legales:</strong> conservamos los datos de las ventas durante los plazos exigidos por la
          normativa fiscal y mercantil (art. 6.1.c RGPD).
        </li>
        <li>
          <strong>Comunicaciones comerciales:</strong> solo si marcas la casilla correspondiente, te enviaremos novedades y ofertas.
          Base legal: tu consentimiento (art. 6.1.a RGPD), que puedes retirar en cualquier momento desde el enlace de baja de cada email.
        </li>
        <li>
          <strong>Recordatorios de celebraciones y de carrito:</strong> solo si los solicitas expresamente. Puedes darte de baja en
          cualquier momento.
        </li>
        <li>
          <strong>Opiniones:</strong> nombre y texto que decidas publicar, con tu consentimiento.
        </li>
        <li>
          <strong>Analítica web:</strong> solo si aceptas las cookies de analítica (ver{" "}
          <Link href="/cookies">política de cookies</Link>).
        </li>
      </ul>
      <h2>Datos de pago</h2>
      <p>
        Los pagos online los procesa Stripe Payments Europe Ltd. como proveedor independiente. Nosotros nunca vemos ni almacenamos el
        número completo de tu tarjeta.
      </p>
      <h2>Destinatarios y encargados del tratamiento</h2>
      <p>
        No cedemos tus datos a terceros salvo obligación legal. Utilizamos proveedores que actúan como encargados del tratamiento con las
        garantías adecuadas: alojamiento web y base de datos, envío de correo electrónico, pasarela de pago (Stripe) y, en su caso,
        WhatsApp Business (Meta). Algunos pueden realizar transferencias internacionales amparadas en el Marco de Privacidad de Datos UE-EE.
        UU. o en cláusulas contractuales tipo.
      </p>
      <h2>Plazos de conservación</h2>
      <p>
        Los datos de pedidos se conservan mientras dure la relación y, después, durante los plazos legales (con carácter general, 6 años
        para obligaciones contables). Los carritos guardados se eliminan a los 30 días. Los datos de marketing, hasta que retires tu
        consentimiento.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a {b.email}{" "}
        indicando el derecho que ejerces. Si consideras que no hemos atendido correctamente tu solicitud, puedes reclamar ante la Agencia
        Española de Protección de Datos (www.aepd.es).
      </p>
    </LegalPage>
  );
}
