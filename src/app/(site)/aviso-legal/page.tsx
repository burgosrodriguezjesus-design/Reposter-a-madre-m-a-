import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { getSettings } from "@/lib/settings";
import { fullAddress } from "@/lib/structured-data";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = { title: "Aviso legal", alternates: { canonical: "/aviso-legal" } };

export default async function LegalNoticePage() {
  const { business: b } = await getSettings();
  return (
    <LegalPage title="Aviso legal" path="/aviso-legal">
      <h2>Datos identificativos</h2>
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico
        (LSSI-CE), se informa de que el sitio web {siteUrl()} es titularidad de:
      </p>
      <ul>
        <li>Titular: {b.legalName}</li>
        <li>NIF/CIF: {b.taxId}</li>
        <li>Nombre comercial: {b.name}</li>
        <li>Domicilio: {fullAddress(b)}</li>
        <li>Teléfono: {b.phone}</li>
        <li>Email: {b.email}</li>
        {b.registryInfo && <li>Datos registrales: {b.registryInfo}</li>}
        <li>Registro sanitario: {b.sanitaryRegistry}</li>
      </ul>
      <h2>Objeto y condiciones de uso</h2>
      <p>
        Este sitio web informa sobre los productos de repostería elaborados por {b.name} y permite realizar pedidos online. El acceso es
        gratuito y atribuye la condición de usuario, que se compromete a hacer un uso adecuado de los contenidos y a no emplearlos para
        actividades ilícitas o contrarias a la buena fe.
      </p>
      <h2>Propiedad intelectual e industrial</h2>
      <p>
        Los textos, fotografías, diseños, logotipos y demás contenidos de esta web son propiedad de {b.legalName} o de terceros que han
        autorizado su uso. Queda prohibida su reproducción, distribución o transformación sin autorización expresa.
      </p>
      <h2>Responsabilidad</h2>
      <p>
        El titular no se hace responsable de los daños derivados de interrupciones del servicio, virus o fallos técnicos ajenos a su
        control, ni del contenido de sitios web enlazados de terceros. Las fotografías de los productos son orientativas: al ser
        elaboraciones artesanales, pueden existir ligeras diferencias de forma y color.
      </p>
      <h2>Legislación aplicable</h2>
      <p>
        Las presentes condiciones se rigen por la legislación española. Para cualquier controversia, las partes se someten a los juzgados
        y tribunales que correspondan conforme a la normativa de consumidores y usuarios.
      </p>
    </LegalPage>
  );
}
