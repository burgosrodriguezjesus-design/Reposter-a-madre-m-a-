import type { Coupon, Promotion } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { Badge, Card, Check, Field, PageHeader } from "@/components/admin/ui";
import { ActionForm, ConfirmButton, MoneyInput, SubmitButton } from "@/components/admin/forms";
import { DemoBadge } from "@/components/site/ui";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { deleteCoupon, deletePromotion, saveCoupon, savePromotion } from "./actions";

export const metadata = { title: "Promociones y cupones" };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function PromotionForm({ promo }: { promo?: Promotion }) {
  return (
    <ActionForm action={savePromotion} className="space-y-3" resetOnSuccess={!promo}>
      {promo && <input type="hidden" name="id" value={promo.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título" className="sm:col-span-2">
          <input name="title" required defaultValue={promo?.title} className="input" />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <textarea name="description" rows={2} defaultValue={promo?.description} className="input" />
        </Field>
        <Field label="Etiqueta">
          <input name="badge" defaultValue={promo?.badge ?? ""} className="input" placeholder="Temporada, Oferta…" />
        </Field>
        <Field label="Orden">
          <input name="sortOrder" type="number" defaultValue={promo?.sortOrder ?? 0} className="input" />
        </Field>
        <Field label="Texto del botón">
          <input name="ctaLabel" defaultValue={promo?.ctaLabel ?? ""} className="input" placeholder="Ver productos" />
        </Field>
        <Field label="Enlace del botón">
          <input name="ctaHref" defaultValue={promo?.ctaHref ?? ""} className="input" placeholder="/categoria/temporada" />
        </Field>
        <Field label="Desde (opcional)">
          <input name="startsAt" type="date" defaultValue={day(promo?.startsAt ?? null)} className="input" />
        </Field>
        <Field label="Hasta (opcional)">
          <input name="endsAt" type="date" defaultValue={day(promo?.endsAt ?? null)} className="input" />
        </Field>
        <Field label="Imagen (opcional)" className="sm:col-span-2">
          <input type="file" name="image" accept="image/*" className="block w-full text-sm" />
        </Field>
      </div>
      <Check name="active" label="Activa" defaultChecked={promo?.active ?? true} />
      <SubmitButton className="btn-dark btn-sm">{promo ? "Guardar" : "Crear promoción"}</SubmitButton>
    </ActionForm>
  );
}

function CouponForm({ coupon }: { coupon?: Coupon }) {
  return (
    <ActionForm action={saveCoupon} className="space-y-3" resetOnSuccess={!coupon}>
      {coupon && <input type="hidden" name="id" value={coupon.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Código">
          <input name="code" required defaultValue={coupon?.code} className="input uppercase" placeholder="VERANO10" />
        </Field>
        <Field label="Tipo">
          <select name="type" defaultValue={coupon?.type ?? "PERCENT"} className="input">
            <option value="PERCENT">Porcentaje</option>
            <option value="FIXED">Importe fijo</option>
            <option value="FREE_DELIVERY">Envío gratis</option>
          </select>
        </Field>
        <Field label="Porcentaje (si es %)">
          <input name="percent" type="number" min={1} max={100} defaultValue={coupon?.type === "PERCENT" ? coupon.value : 10} className="input" />
        </Field>
        <Field label="Importe (si es fijo)">
          <MoneyInput name="amountCents" defaultValue={coupon?.type === "FIXED" ? coupon.value : 500} />
        </Field>
        <Field label="Pedido mínimo">
          <MoneyInput name="minOrderCents" defaultValue={coupon?.minOrderCents ?? 0} />
        </Field>
        <Field label="Usos máximos (vacío = ilimitado)">
          <input name="maxRedemptions" type="number" min={1} defaultValue={coupon?.maxRedemptions ?? ""} className="input" />
        </Field>
        <Field label="Válido desde">
          <input name="startsAt" type="date" defaultValue={day(coupon?.startsAt ?? null)} className="input" />
        </Field>
        <Field label="Válido hasta">
          <input name="endsAt" type="date" defaultValue={day(coupon?.endsAt ?? null)} className="input" />
        </Field>
        <Field label="Descripción interna" className="sm:col-span-2">
          <input name="description" defaultValue={coupon?.description} className="input" />
        </Field>
      </div>
      <Check name="active" label="Activo" defaultChecked={coupon?.active ?? true} />
      <SubmitButton className="btn-dark btn-sm">{coupon ? "Guardar" : "Crear cupón"}</SubmitButton>
    </ActionForm>
  );
}

function describe(c: Coupon) {
  if (c.type === "PERCENT") return `${c.value} %`;
  if (c.type === "FIXED") return formatPrice(c.value);
  return "Envío gratis";
}

export default async function MarketingPage() {
  const [promotions, coupons] = await Promise.all([
    db.promotion.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    db.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], take: 100 }),
  ]);
  return (
    <>
      <PageHeader title="Promociones y cupones" description="Las promociones activas aparecen en la portada. Los cupones se aplican al finalizar el pedido." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Promociones</h2>
          {promotions.map((p) => (
            <details key={p.id} className="rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft">
              <summary className="flex cursor-pointer items-center gap-2">
                <strong className="flex-1">{p.title}</strong>
                {p.isDemo && <DemoBadge />}
                <Badge className={p.active ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}>{p.active ? "Activa" : "Inactiva"}</Badge>
              </summary>
              <div className="mt-4">
                <PromotionForm promo={p} />
                <form action={deletePromotion} className="mt-3">
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton message="¿Eliminar esta promoción?" className="btn-ghost btn-sm text-red-700">
                    <Trash2 className="size-4" /> Eliminar
                  </ConfirmButton>
                </form>
              </div>
            </details>
          ))}
          <Card title="Nueva promoción">
            <PromotionForm />
          </Card>
        </div>
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Cupones de descuento</h2>
          {coupons.map((c) => (
            <details key={c.id} className="rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <code className="font-semibold">{c.code}</code>
                <span className="text-sm text-cocoa-600">{describe(c)}</span>
                <span className="flex-1 text-xs text-cocoa-500">
                  {c.redemptions} uso{c.redemptions === 1 ? "" : "s"}
                  {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                </span>
                {c.isDemo && <DemoBadge />}
                <Badge className={c.active ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}>{c.active ? "Activo" : "Inactivo"}</Badge>
              </summary>
              <div className="mt-4">
                <CouponForm coupon={c} />
                <form action={deleteCoupon} className="mt-3">
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton message="¿Eliminar este cupón? (si ya se usó, se desactiva)" className="btn-ghost btn-sm text-red-700">
                    <Trash2 className="size-4" /> Eliminar
                  </ConfirmButton>
                </form>
              </div>
            </details>
          ))}
          <Card title="Nuevo cupón">
            <CouponForm />
          </Card>
        </div>
      </div>
    </>
  );
}
