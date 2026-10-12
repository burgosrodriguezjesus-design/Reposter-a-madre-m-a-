import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { CookieSettingsLink } from "@/components/site/CookieConsent";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Política de cookies", alternates: { canonical: "/cookies" } };

export default async function CookiesPage() {
  const { business: b, seo } = await getSettings();
  return (
    <LegalPage title="Política de cookies" path="/cookies">
      <p>
        Esta web utiliza cookies y tecnologías similares (como el almacenamiento local del navegador). Te explicamos cuáles y para qué, de
        acuerdo con el artículo 22.2 de la LSSI-CE y la guía de la AEPD.
      </p>
      <h2>Cookies técnicas (no requieren consentimiento)</h2>
      <ul>
        <li>
          <strong>Carrito</strong> (almacenamiento local «rmm-cart-v1»): guarda los productos que añades. Persistente hasta que vacías el
          carrito.
        </li>
        <li>
          <strong>Preferencias de cookies</strong> («rmm-consent-v1»): recuerda tu elección.
        </li>
        <li>
          <strong>Sesión del panel</strong> («rmm_admin»): solo para el personal de {b.name} que accede al panel de gestión.
        </li>
        <li>
          <strong>Pasarela de pago:</strong> Stripe puede usar cookies propias en su página de pago para prevenir el fraude.
        </li>
      </ul>
      <h2>Cookies de analítica (solo con tu consentimiento)</h2>
      {seo.gaMeasurementId ? (
        <p>
          Usamos Google Analytics 4 (Google Ireland Ltd.) para obtener estadísticas de uso de forma agregada (cookies «_ga» y «_ga_*», hasta
          2 años). Solo se activan si las aceptas.
        </p>
      ) : (
        <p>Actualmente no utilizamos cookies de analítica.</p>
      )}
      <h2>Cookies de terceros al cargar el mapa</h2>
      <p>
        El mapa de Google Maps solo se carga si pulsas «Ver mapa interactivo». En ese momento Google puede instalar sus propias cookies.
      </p>
      <h2>Cómo cambiar tu elección</h2>
      <p>
        Puedes cambiar tus preferencias cuando quieras: <CookieSettingsLink />. También puedes borrar las cookies desde la configuración de
        tu navegador.
      </p>
    </LegalPage>
  );
}
