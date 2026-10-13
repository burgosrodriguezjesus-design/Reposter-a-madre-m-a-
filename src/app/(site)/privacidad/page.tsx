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
          <strong>Ficha de cliente y programa de fidelización:</strong> al confirmar un pedido guardamos una ficha con tu nombre, email,
          teléfono, número de pedidos, importe acumulado y sellos de fidelización, para reconocerte en próximos pedidos y aplicar las
          ventajas del programa. Base legal: ejecución del contrato (art. 6.1.b RGPD).
        </li>
        <li>
          <strong>Tarjetas regalo:</strong> nombre y email de quien la compra y, si se indica, de quien la recibe, y el mensaje. Base
          legal: ejecución del contrato (art. 6.1.b RGPD).
        </li>
        <li>
          <strong>Ejercicio de tus derechos:</strong> email y detalles de tu solicitud, para atenderla y poder demostrar que lo hicimos.
          Base legal: obligación legal (art. 6.1.c RGPD).
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
      <ul>
        <li>Datos de pedidos: 6 años desde la venta (obligaciones contables, art. 30 del Código de Comercio). Después se anonimizan automáticamente.</li>
        <li>
          Fotografías de referencia: se borran automáticamente 90 días después de la fecha del pedido; las enviadas con una solicitud de
          presupuesto, 150 días después de la solicitud.
        </li>
        <li>Solicitudes de presupuesto no aceptadas: 12 meses.</li>
        <li>Tarjetas regalo: 6 años desde la compra; después se anonimizan (se conservan solo importe y estado).</li>
        <li>Opiniones no publicadas: 12 meses. Las publicadas, mientras sigan publicadas o hasta que pidas retirarlas.</li>
        <li>Solicitudes de ejercicio de derechos: 3 años.</li>
        <li>Carritos guardados para recordatorio: 30 días.</li>
        <li>Fichas de cliente sin pedidos ni consentimiento: 24 meses sin actividad.</li>
        <li>Comunicaciones comerciales y recordatorios: hasta que retires tu consentimiento.</li>
        <li>Registros de seguridad: intentos de acceso 90 días; registro de actividad del panel 2 años; copias de seguridad cifradas 35 días.</li>
      </ul>
      <h2>Cómo protegemos tus datos</h2>
      <p>
        Toda la comunicación viaja cifrada (HTTPS con TLS 1.2 o 1.3). Tu nombre, email, teléfono, dirección, notas, dedicatorias, fotos y
        los enlaces de acceso a tus pedidos se guardan cifrados (AES-256) y solo puede verlos el personal autorizado de la repostería, con
        verificación en dos pasos. Queda registrado quién abre la ficha de un pedido o presupuesto, consulta las solicitudes de privacidad,
        busca clientes o pedidos y quién exporta o borra datos. Las
        copias de seguridad también están cifradas. Si se produjera una brecha de seguridad que te afectara, lo notificaríamos a la Agencia
        Española de Protección de Datos en 72 horas y, cuando proceda, también a ti.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad desde{" "}
        <Link href="/privacidad/derechos">este formulario</Link> (te pediremos confirmarlo desde tu email para proteger tus datos) o escribiendo
        a {b.email}. Respondemos en el plazo máximo de un mes. Si consideras que no hemos atendido correctamente tu solicitud, puedes reclamar
        ante la Agencia Española de Protección de Datos (www.aepd.es).
      </p>
    </LegalPage>
  );
}
