import type { GiftCardStatus } from "@prisma/client";
import { Search } from "lucide-react";
import { Badge, Card, Check, Empty, Field, PageHeader } from "@/components/admin/ui";
import { ActionForm, MoneyInput, SubmitButton } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { parsePiiQuery } from "@/lib/pii-search";
import { formatDateTime, formatPrice } from "@/lib/format";
import { createGiftCard, updateGiftCard } from "./actions";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Tarjetas regalo" };

const STATUS: Record<GiftCardStatus, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Pendiente de pago", tone: "bg-amber-100 text-amber-900" },
  ACTIVE: { label: "Activa", tone: "bg-emerald-100 text-emerald-900" },
  DEPLETED: { label: "Agotada", tone: "bg-stone-200 text-stone-700" },
  CANCELLED: { label: "Cancelada", tone: "bg-red-100 text-red-900" },
};

export default async function GiftCardsAdminPage({ searchParams }: PageProps<"/admin/tarjetas-regalo">) {
  await requirePermission("giftcards.manage");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const search = parsePiiQuery(query);
  const cards = await db.giftCard.findMany({
    where:
      search.kind === "email"
        ? { OR: [{ purchaserEmailHash: search.hash }, { recipientEmailHash: search.hash }] }
        : query
          ? { code: { contains: query.toUpperCase() } }
          : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Tarjetas regalo" description="Las compradas online se activan solas al pagar. Las reservadas para pagar en tienda, actívalas al cobrarlas." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <form className="mb-4 flex gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
              <input name="q" defaultValue={query} className="input pl-9" placeholder="Código o email" aria-label="Buscar tarjeta" />
            </label>
            <button className="btn-dark btn-sm">Buscar</button>
          </form>
          {cards.length === 0 ? (
            <Empty>No hay tarjetas regalo.</Empty>
          ) : (
            <ul className="space-y-2">
              {cards.map((c) => (
                <li key={c.id} className="rounded-xl border border-sand-300/60 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-semibold tracking-wider">{c.code}</code>
                    <Badge className={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                    <span className="ml-auto text-sm">
                      <strong>{formatPrice(c.balanceCents)}</strong> / {formatPrice(c.initialCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-cocoa-600">
                    {c.purchaserName} ({c.purchaserEmail}){c.recipientName ? ` → ${c.recipientName}` : ""} · {formatDateTime(c.createdAt)}
                    {c.expiresAt ? ` · caduca ${c.expiresAt.toLocaleDateString("es-ES")}` : ""}
                  </p>
                  <ActionForm action={updateGiftCard} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    {c.status === "PENDING_PAYMENT" && (
                      <button name="intent" value="activate" className="btn-primary btn-sm">
                        Cobrada: activar y enviar
                      </button>
                    )}
                    {(c.status === "ACTIVE" || c.status === "DEPLETED") && (
                      <>
                        <div className="w-32">
                          <MoneyInput name="balanceCents" defaultValue={c.balanceCents} />
                        </div>
                        <button name="intent" value="balance" className="btn-outline btn-sm">
                          Ajustar saldo
                        </button>
                      </>
                    )}
                    {c.status !== "CANCELLED" && (
                      <button name="intent" value="cancel" className="btn-ghost btn-sm text-red-700">
                        Cancelar
                      </button>
                    )}
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card title="Crear tarjeta (venta en tienda)">
          <ActionForm action={createGiftCard} className="space-y-3" resetOnSuccess>
            <Field label="Importe">
              <MoneyInput name="amountCents" defaultValue={3000} required />
            </Field>
            <Field label="Comprador">
              <input name="purchaserName" required className="input" />
            </Field>
            <Field label="Email del comprador">
              <input name="purchaserEmail" type="email" className="input" />
            </Field>
            <Field label="Para (nombre)">
              <input name="recipientName" className="input" />
            </Field>
            <Field label="Email de quien la recibe">
              <input name="recipientEmail" type="email" className="input" />
            </Field>
            <Field label="Mensaje">
              <textarea name="message" rows={2} className="input" />
            </Field>
            <Check name="sendEmail" label="Enviar la tarjeta por email" defaultChecked />
            <SubmitButton className="btn-dark btn-sm">Crear tarjeta</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
