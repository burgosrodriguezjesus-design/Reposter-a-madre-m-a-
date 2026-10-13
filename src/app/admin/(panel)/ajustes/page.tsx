import Link from "next/link";
import { CheckCircle2, CircleAlert, Trash2 } from "lucide-react";
import { Card, PageHeader } from "@/components/admin/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin/forms";
import { SettingsForm, type FieldDef } from "@/components/admin/SettingsForm";
import { DemoDataButton } from "./DemoDataButton";
import { getSettings } from "@/lib/settings";
import { hasDemoContent } from "@/lib/catalog";
import { requirePermission } from "@/lib/auth";
import { setupChecklist } from "@/lib/setup-status";
import { isWhatsAppApiConfigured } from "@/lib/whatsapp";
import { connectObrador, disconnectObrador, removeBusinessPhoto, uploadBusinessPhoto } from "./actions";
import { obradorStatus } from "@/lib/obrador";

export const metadata = { title: "Ajustes" };

const BUSINESS_FIELDS: FieldDef[] = [
  { name: "name", label: "Nombre comercial", type: "text" },
  { name: "tagline", label: "Eslogan", type: "text", hint: "Aparece como titular principal de la portada." },
  { name: "description", label: "Descripción del negocio", type: "textarea", hint: "Se usa en Google y en el pie de página (150-300 caracteres)." },
  { name: "venue", label: "Lugar (mercado, centro comercial…)", type: "text", hint: "Ej.: «Mercado de Bailén, puestos 70-71». Aparece en la portada, en «Dónde estamos» y en los emails." },
  { name: "street", label: "Dirección (calle y número)", type: "text" },
  { name: "postalCode", label: "Código postal", type: "text" },
  { name: "city", label: "Ciudad", type: "text", hint: "Se usa en títulos y en las páginas locales para Google." },
  { name: "province", label: "Provincia", type: "text" },
  { name: "neighborhood", label: "Barrio", type: "text", hint: "Crea la página «Pastelería cerca de [barrio]»." },
  { name: "latitude", label: "Latitud", type: "float", hint: "Búscala en Google Maps (clic derecho sobre tu local)." },
  { name: "longitude", label: "Longitud", type: "float" },
  { name: "phone", label: "Teléfono", type: "text" },
  { name: "whatsapp", label: "WhatsApp (con prefijo +34)", type: "text" },
  { name: "email", label: "Email de contacto", type: "email" },
  { name: "howToGetThere", label: "Indicaciones para llegar", type: "textarea" },
  { name: "googleBusinessUrl", label: "Enlace a tu Perfil de Empresa de Google", type: "url", full: true, hint: "La URL de tu ficha en Google Maps. Usa exactamente el mismo nombre, dirección y teléfono que en la web." },
  { name: "googleReviewUrl", label: "Enlace para dejar reseña en Google", type: "url", full: true, hint: "En tu Perfil de Empresa → «Pedir reseñas»." },
  { name: "instagram", label: "Instagram (URL)", type: "url" },
  { name: "facebook", label: "Facebook (URL)", type: "url" },
  { name: "tiktok", label: "TikTok (URL)", type: "url" },
  { name: "priceRange", label: "Rango de precios", type: "select", options: ["€", "€€", "€€€"].map((v) => ({ value: v, label: v })) },
  { name: "legalName", label: "Razón social / titular", type: "text", hint: "Para el aviso legal y las condiciones." },
  { name: "taxId", label: "NIF / CIF", type: "text" },
  { name: "sanitaryRegistry", label: "Nº de Registro Sanitario", type: "text" },
  { name: "registryInfo", label: "Datos del Registro Mercantil (si aplica)", type: "text" },
];

const ORDERING_FIELDS: FieldDef[] = [
  { name: "onlineOrdersEnabled", label: "Aceptar pedidos online", type: "boolean", hint: "Desactívalo temporalmente si no puedes atender más pedidos." },
  { name: "closedMessage", label: "Mensaje cuando no se aceptan pedidos", type: "textarea" },
  { name: "pickupEnabled", label: "Recogida en tienda", type: "boolean" },
  { name: "deliveryEnabled", label: "Entrega a domicilio", type: "boolean", hint: "Configura las zonas en «Zonas de reparto». Requiere pago online." },
  { name: "cardPaymentEnabled", label: "Pago online con tarjeta (Stripe)", type: "boolean", hint: "Necesita las claves de Stripe configuradas." },
  { name: "payInStoreEnabled", label: "Reservar y pagar en tienda", type: "boolean" },
  { name: "autoAcceptStandardOrders", label: "Aceptar automáticamente los pedidos sin personalización", type: "boolean", hint: "Los pedidos con dedicatoria, foto o tarta personalizada siempre quedan pendientes de revisión." },
  { name: "cancellationSummary", label: "Resumen de la política de cancelación", type: "textarea" },
  { name: "allergenNotice", label: "Aviso general de alérgenos", type: "textarea" },
];

const MARKETING_FIELDS: FieldDef[] = [
  { name: "announcement", label: "Barra de anuncio superior", type: "text", full: true, hint: "Déjalo vacío para ocultarla." },
  { name: "showDemoBanner", label: "Mostrar aviso de «modo demostración» mientras haya contenido demo", type: "boolean" },
  { name: "loyaltyEnabled", label: "Programa de fidelización (tarjeta de sellos)", type: "boolean" },
  { name: "loyaltyStampEveryCents", label: "Un sello por cada", type: "money" },
  { name: "loyaltyStampsForReward", label: "Sellos para el premio", type: "number" },
  { name: "loyaltyRewardCents", label: "Valor del cupón regalo", type: "money" },
  { name: "giftCardsEnabled", label: "Vender tarjetas regalo", type: "boolean" },
  { name: "giftCardAmounts", label: "Importes de las tarjetas (€)", type: "moneyList", hint: "Separados por comas: 20, 30, 50" },
  { name: "giftCardValidityMonths", label: "Validez de las tarjetas (meses)", type: "number" },
  { name: "abandonedCartEnabled", label: "Recordatorio de carrito (solo a quien lo autoriza)", type: "boolean" },
  { name: "abandonedCartDelayHours", label: "Enviar recordatorio tras (horas)", type: "number" },
  { name: "remindersEnabled", label: "Recordatorios de celebraciones (con consentimiento)", type: "boolean" },
  { name: "reminderDaysBefore", label: "Días de antelación del recordatorio", type: "number" },
];

const SEO_FIELDS: FieldDef[] = [
  { name: "homeTitle", label: "Título de la portada en Google", type: "text", maxLength: 70, full: true, hint: "Vacío = «[Nombre] · Repostería artesanal en [Ciudad]»." },
  { name: "homeDescription", label: "Metadescripción de la portada", type: "textarea", maxLength: 170 },
  { name: "googleSiteVerification", label: "Código de verificación de Google Search Console", type: "text", full: true, hint: "Search Console → Añadir propiedad → Prefijo de URL → Etiqueta HTML: copia solo el valor de content=\"…\"." },
  { name: "gaMeasurementId", label: "ID de Google Analytics 4", type: "text", placeholder: "G-XXXXXXXXXX", hint: "Solo se carga si el visitante acepta las cookies de analítica." },
];

const NOTIFICATION_FIELDS: FieldDef[] = [
  { name: "adminEmail", label: "Email donde recibir los avisos de pedidos", type: "email", full: true },
  { name: "adminWhatsapp", label: "WhatsApp del obrador para avisos automáticos", type: "text" },
  { name: "whatsappNotifyAdmin", label: "Avisarme por WhatsApp de cada pedido (API oficial de WhatsApp Business)", type: "boolean", hint: "Requiere configurar WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID y una plantilla aprobada (ver README)." },
];

function pick(obj: object, fields: FieldDef[]) {
  return Object.fromEntries(fields.map((f) => [f.name, (obj as Record<string, unknown>)[f.name]]));
}

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const [settings, demo, obrador] = await Promise.all([getSettings(), hasDemoContent(), obradorStatus()]);
  const b = settings.business;
  const checklist = setupChecklist(settings, demo);
  const integrations = [
    { label: "Stripe (pagos)", ok: !!process.env.STRIPE_SECRET_KEY, extra: process.env.STRIPE_WEBHOOK_SECRET ? "webhook OK" : "falta STRIPE_WEBHOOK_SECRET" },
    { label: "Correo SMTP", ok: !!process.env.SMTP_HOST, extra: process.env.SMTP_HOST ?? "" },
    { label: "Almacenamiento de fotos", ok: true, extra: process.env.STORAGE_DRIVER === "supabase" ? "Supabase Storage" : process.env.STORAGE_DRIVER === "database" ? "Base de datos" : "Local (carpeta uploads)" },
    { label: "WhatsApp Business API", ok: isWhatsAppApiConfigured(), extra: "opcional" },
    { label: "Tareas programadas (CRON_SECRET)", ok: !!process.env.CRON_SECRET, extra: "" },
  ];

  const sections = [
    ["negocio", "Negocio"],
    ["fotos", "Fotos"],
    ["pedidos", "Pedidos y pagos"],
    ["marketing", "Marketing"],
    ["seo", "SEO y Google"],
    ["avisos", "Avisos"],
    ["obrador", "Obrador"],
    ["cuenta", "Cuenta"],
    ["demo", "Demo"],
  ];

  return (
    <>
      <PageHeader title="Ajustes" description="Todo lo que ves en la web se configura aquí." />
      <nav className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="chip shrink-0">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <Card title="Datos del negocio" id="negocio">
          <SettingsForm section="business" fields={BUSINESS_FIELDS} initial={pick(b, BUSINESS_FIELDS)} />
        </Card>

        <Card title="Fotografías del negocio" id="fotos">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold text-cocoa-900">Foto principal de la portada</h3>
              <p className="text-sm text-cocoa-500">Tu tarta más espectacular, en formato cuadrado y buena luz.</p>
              {b.heroImageUrl ? (
                <div className="mt-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.heroImageUrl} alt={b.heroImageAlt} className="size-24 rounded-xl object-cover" />
                  <form action={removeBusinessPhoto}>
                    <input type="hidden" name="target" value="hero" />
                    <button className="btn-ghost btn-sm text-red-700">
                      <Trash2 className="size-4" /> Quitar
                    </button>
                  </form>
                </div>
              ) : (
                <p className="mt-2 text-sm text-cocoa-500">Ahora se muestra la ilustración de demostración.</p>
              )}
              <ActionForm action={uploadBusinessPhoto} className="mt-3 space-y-2" resetOnSuccess>
                <input type="hidden" name="target" value="hero" />
                <input type="file" name="file" accept="image/*" required className="block w-full text-sm" />
                <input name="alt" required className="input" placeholder="Descripción: tarta de tres pisos con flores…" />
                <SubmitButton className="btn-dark btn-sm" pendingText="Subiendo…">
                  Subir foto de portada
                </SubmitButton>
              </ActionForm>
            </div>
            <div>
              <h3 className="font-semibold text-cocoa-900">Fotos del establecimiento</h3>
              <p className="text-sm text-cocoa-500">Fachada, escaparate, obrador… Se muestran en «Dónde estamos».</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {b.storePhotos.map((p) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.alt} className="size-20 rounded-xl object-cover" />
                    <form action={removeBusinessPhoto} className="absolute -top-2 -right-2">
                      <input type="hidden" name="target" value="store" />
                      <input type="hidden" name="url" value={p.url} />
                      <button className="inline-flex size-7 items-center justify-center rounded-full bg-white shadow" aria-label="Quitar foto">
                        <Trash2 className="size-3.5 text-red-700" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <ActionForm action={uploadBusinessPhoto} className="mt-3 space-y-2" resetOnSuccess>
                <input type="hidden" name="target" value="store" />
                <input type="file" name="file" accept="image/*" required className="block w-full text-sm" />
                <input name="alt" required className="input" placeholder="Descripción: fachada de la repostería…" />
                <SubmitButton className="btn-dark btn-sm" pendingText="Subiendo…">
                  Añadir foto
                </SubmitButton>
              </ActionForm>
            </div>
          </div>
        </Card>

        <Card title="Pedidos y pagos" id="pedidos">
          <SettingsForm section="ordering" fields={ORDERING_FIELDS} initial={pick(settings.ordering, ORDERING_FIELDS)} />
          <p className="mt-3 text-xs text-cocoa-500">Horarios, antelación y capacidad se configuran en «Calendario y horario».</p>
        </Card>

        <Card title="Marketing y fidelización" id="marketing">
          <SettingsForm section="marketing" fields={MARKETING_FIELDS} initial={pick(settings.marketing, MARKETING_FIELDS)} />
        </Card>

        <Card title="SEO y Google" id="seo">
          <SettingsForm section="seo" fields={SEO_FIELDS} initial={pick(settings.seo, SEO_FIELDS)} />
        </Card>

        <Card title="Avisos de nuevos pedidos" id="avisos">
          <SettingsForm section="notifications" fields={NOTIFICATION_FIELDS} initial={pick(settings.notifications, NOTIFICATION_FIELDS)} />
        </Card>

        <Card title="Conexión con el obrador" id="obrador">
          <p className="text-sm text-cocoa-600">
            Cada pedido confirmado en la web aparece solo en la app del obrador (calendario, producción, ingredientes y compra) con el día y la
            hora de recogida. Si se cancela aquí, también se cancela allí.
          </p>
          {obrador.connected ? (
            <div className="mt-4 space-y-3">
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>
                  Conectado con <strong>{obrador.host}</strong> desde el{" "}
                  {new Date(obrador.connectedAt).toLocaleDateString("es-ES", { timeZone: settings.business.timezone })}.
                </span>
              </p>
              {obrador.pending > 0 && <p className="text-sm text-cocoa-600">Enviando {obrador.pending} pedidos…</p>}
              {obrador.failed > 0 && (
                <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <CircleAlert className="size-4" /> {obrador.failed} pedidos no se pudieron enviar. Revisa la conexión y reintenta desde
                  Registro de actividad → Trabajos fallidos.
                </p>
              )}
              <form action={disconnectObrador}>
                <ConfirmButton message="¿Desconectar el obrador? Los pedidos nuevos dejarán de enviarse (los que ya están allí no se borran).">
                  Desconectar
                </ConfirmButton>
              </form>
            </div>
          ) : (
            <ActionForm action={connectObrador} className="mt-4 space-y-2" resetOnSuccess>
              <label className="label" htmlFor="obrador-code">
                Código de conexión
              </label>
              <input id="obrador-code" name="code" required autoComplete="off" className="input font-mono" placeholder="https://obrador-pasteleria.vercel.app#tienda_…" />
              <p className="text-xs text-cocoa-500">En la app del obrador: Configuración → Tienda online → «Conectar con la tienda online», copia el código y pégalo aquí.</p>
              <SubmitButton className="btn-dark btn-sm" pendingText="Conectando…">
                Conectar
              </SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card title="Integraciones">
          <ul className="grid gap-2 sm:grid-cols-2">
            {integrations.map((i) => (
              <li key={i.label} className="flex items-center gap-2 rounded-xl bg-cream-50 p-3 text-sm">
                {i.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleAlert className="size-4 text-amber-600" />}
                <strong>{i.label}</strong>
                <span className="text-cocoa-500">{i.ok ? i.extra : "sin configurar"}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-1 text-sm">
            {checklist
              .filter((c) => !c.ok)
              .map((c) => (
                <li key={c.label} className="text-cocoa-600">
                  • <strong>{c.label}:</strong> {c.help}
                </li>
              ))}
          </ul>
        </Card>

        <Card title="Cuenta y usuarios" id="cuenta">
          <p className="text-sm text-cocoa-600">
            Gestiona tu contraseña, la verificación en dos pasos y tus sesiones en{" "}
            <Link href="/admin/seguridad" className="font-medium text-blush-700 underline">
              Seguridad
            </Link>
            . Los usuarios del equipo y sus permisos están en{" "}
            <Link href="/admin/usuarios" className="font-medium text-blush-700 underline">
              Usuarios
            </Link>{" "}
            y el registro de actividad en{" "}
            <Link href="/admin/auditoria" className="font-medium text-blush-700 underline">
              Auditoría
            </Link>
            .
          </p>
        </Card>

        <Card title="Datos de demostración" id="demo">
          {demo ? (
            <>
              <p className="mb-3 text-sm text-cocoa-600">
                Elimina de una vez los productos, categorías, zonas, cupones, promociones y opiniones de ejemplo. Los productos que hayas editado
                se conservan (al editarlos pasan a ser tuyos).
              </p>
              <DemoDataButton />
            </>
          ) : (
            <p className="text-sm text-cocoa-600">No queda contenido de demostración. ✨</p>
          )}
        </Card>
      </div>
    </>
  );
}
