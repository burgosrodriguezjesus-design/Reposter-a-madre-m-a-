import type { ReviewStatus } from "@prisma/client";
import { BadgeCheck } from "lucide-react";
import { Badge, Empty, PageHeader, Tabs } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { DemoBadge, Stars } from "@/components/site/ui";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { moderateReview } from "./actions";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Opiniones" };

const LABEL: Record<ReviewStatus, { label: string; tone: string }> = {
  PENDING: { label: "Pendiente", tone: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "Publicada", tone: "bg-emerald-100 text-emerald-900" },
  HIDDEN: { label: "Oculta", tone: "bg-stone-200 text-stone-700" },
};

export default async function ReviewsAdminPage({ searchParams }: PageProps<"/admin/opiniones">) {
  await requirePermission("reviews.manage");
  const { estado } = await searchParams;
  const status: ReviewStatus = estado === "APPROVED" || estado === "HIDDEN" ? estado : "PENDING";
  const [reviews, pending] = await Promise.all([
    db.review.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.review.count({ where: { status: "PENDING" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Opiniones"
        description="Las opiniones las escriben tus clientes. Revisa que no contengan datos personales u ofensas y publícalas. No se pueden crear ni editar desde el panel, para que sean siempre reales."
      />
      <Tabs
        active={`/admin/opiniones?estado=${status}`}
        items={[
          { href: "/admin/opiniones?estado=PENDING", label: "Pendientes", count: pending },
          { href: "/admin/opiniones?estado=APPROVED", label: "Publicadas" },
          { href: "/admin/opiniones?estado=HIDDEN", label: "Ocultas" },
        ]}
      />
      {reviews.length === 0 ? (
        <Empty>No hay opiniones en esta vista.</Empty>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <Stars rating={r.rating} />
                <strong>{r.authorName}</strong>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <BadgeCheck className="size-3.5" /> Pedido {r.orderNumber}
                  </span>
                )}
                {r.isDemo && <DemoBadge />}
                <Badge className={LABEL[r.status].tone}>{LABEL[r.status].label}</Badge>
                <span className="ml-auto text-xs text-cocoa-500">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-cocoa-700">{r.text}</p>
              <ActionForm action={moderateReview} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <textarea name="reply" rows={2} defaultValue={r.reply ?? ""} className="input text-sm" placeholder="Respuesta pública (opcional)" />
                <div className="flex flex-wrap gap-2">
                  {r.status !== "APPROVED" && (
                    <button name="intent" value="approve" className="btn-primary btn-sm">
                      Publicar
                    </button>
                  )}
                  {r.status === "APPROVED" && (
                    <button name="intent" value="reply" className="btn-outline btn-sm">
                      Guardar respuesta
                    </button>
                  )}
                  {r.status !== "HIDDEN" && (
                    <button name="intent" value="hide" className="btn-outline btn-sm">
                      Ocultar
                    </button>
                  )}
                  <button name="intent" value="delete" className="btn-ghost btn-sm text-red-700">
                    Eliminar
                  </button>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
