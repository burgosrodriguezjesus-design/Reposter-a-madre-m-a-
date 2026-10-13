import type { DeliveryZone } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { Card, Check, Field, PageHeader } from "@/components/admin/ui";
import { ActionForm, ConfirmButton, MoneyInput, SubmitButton } from "@/components/admin/forms";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { DemoBadge } from "@/components/site/ui";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { MIN_ZONE_TEXT } from "@/lib/catalog";
import { deleteZone, saveZone } from "./actions";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Zonas de reparto" };

function ZoneForm({ zone }: { zone?: DeliveryZone }) {
  return (
    <ActionForm action={saveZone} className="space-y-3" resetOnSuccess={!zone}>
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre de la zona">
          <input name="name" required defaultValue={zone?.name} className="input" placeholder="Barrio o municipio" />
        </Field>
        <Field label="Códigos postales" hint="Separados por comas">
          <input name="postalCodes" required defaultValue={zone?.postalCodes.join(", ")} className="input" placeholder="28010, 28015" />
        </Field>
        <Field label="Coste de envío">
          <MoneyInput name="feeCents" defaultValue={zone?.feeCents ?? 400} />
        </Field>
        <Field label="Pedido mínimo">
          <MoneyInput name="minOrderCents" defaultValue={zone?.minOrderCents ?? 0} />
        </Field>
        <Field label="Envío gratis desde (opcional)">
          <MoneyInput name="freeFromCents" defaultValue={zone?.freeFromCents} placeholder="Sin envío gratis" />
        </Field>
        <Field label="Orden">
          <input name="sortOrder" type="number" defaultValue={zone?.sortOrder ?? 0} className="input" />
        </Field>
        <Field
          label="Texto de la página de la zona (opcional, SEO)"
          className="sm:col-span-2"
          hint={`Si escribes al menos ${MIN_ZONE_TEXT} caracteres de texto propio (cómo llegáis, tiempos, lugares de la zona…), se publica una página «Tartas a domicilio en [zona]» indexable en Google. Llevas ${zone?.description.length ?? 0}.`}
        >
          <textarea name="description" rows={4} defaultValue={zone?.description} className="input" />
        </Field>
      </div>
      <Check name="active" label="Zona activa" defaultChecked={zone?.active ?? true} />
      <SubmitButton className="btn-dark btn-sm">{zone ? "Guardar zona" : "Crear zona"}</SubmitButton>
    </ActionForm>
  );
}

export default async function DeliveryPage() {
  await requirePermission("delivery.manage");
  const [zones, settings] = await Promise.all([db.deliveryZone.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }), getSettings()]);
  return (
    <>
      <PageHeader title="Zonas de reparto" description="Define dónde entregas a domicilio, cuánto cuesta y el pedido mínimo. La web comprueba el código postal del cliente." />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {zones.map((z) => (
            <Card
              key={z.id}
              title={z.name}
              actions={
                <div className="flex items-center gap-2">
                  {z.isDemo && <DemoBadge />}
                  {z.description.length >= MIN_ZONE_TEXT && (
                    <a href={`/zonas/${z.slug}`} target="_blank" className="text-xs text-blush-700 underline">
                      Ver página
                    </a>
                  )}
                  <form action={deleteZone}>
                    <input type="hidden" name="id" value={z.id} />
                    <ConfirmButton message={`¿Eliminar la zona ${z.name}?`} className="btn-ghost size-9 p-0">
                      <Trash2 className="size-4" />
                    </ConfirmButton>
                  </form>
                </div>
              }
            >
              <ZoneForm zone={z} />
            </Card>
          ))}
          {zones.length === 0 && <p className="text-sm text-cocoa-500">Aún no hay zonas: solo se ofrecerá recogida en tienda.</p>}
        </div>
        <div className="space-y-6">
          <Card title="Entregas a domicilio">
            <SettingsForm
              section="ordering"
              fields={[
                { name: "deliveryEnabled", label: "Ofrecer entrega a domicilio", type: "boolean", hint: "Requiere pago online con Stripe." },
                { name: "deliveryInfo", label: "Información para el cliente", type: "textarea" },
              ]}
              initial={{ deliveryEnabled: settings.ordering.deliveryEnabled, deliveryInfo: settings.ordering.deliveryInfo }}
            />
          </Card>
          <Card title="Nueva zona">
            <ZoneForm />
          </Card>
        </div>
      </div>
    </>
  );
}
