import { Badge, Card, Empty, PageHeader } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { db } from "@/lib/db";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { RETENTION } from "@/lib/privacy";
import { formatDateTime } from "@/lib/format";
import { resolveRequest } from "./actions";

export const metadata = { title: "Privacidad (RGPD)" };

const TYPE: Record<string, string> = {
  ACCESS: "Acceso",
  RECTIFICATION: "Rectificación",
  ERASURE: "Supresión",
  PORTABILITY: "Portabilidad",
  OBJECTION: "Oposición",
  RESTRICTION: "Limitación",
};

export default async function PrivacyAdminPage() {
  const admin = await requirePermission("privacy.manage");
  await auditAdmin(admin, { action: "privacy.requests_viewed", entity: "DataRequest" });
  const [pending, closed] = await Promise.all([
    db.dataRequest.findMany({ where: { status: "VERIFIED" }, orderBy: { dueAt: "asc" } }),
    db.dataRequest.findMany({ where: { status: { in: ["COMPLETED", "REJECTED"] } }, orderBy: { resolvedAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <PageHeader title="Privacidad (RGPD)" description="Solicitudes de derechos de clientes verificadas por email. Plazo legal de respuesta: 1 mes." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {pending.length === 0 && <Empty>No hay solicitudes pendientes.</Empty>}
          {pending.map((r) => {
            const late = r.dueAt < new Date();
            return (
              <Card key={r.id} title={`${TYPE[r.type]} · ${r.email}`}>
                <p className="text-sm text-cocoa-600">
                  Recibida {formatDateTime(r.createdAt)} · responder antes del{" "}
                  <strong className={late ? "text-red-700" : ""}>{formatDateTime(r.dueAt)}</strong> {late && <Badge className="bg-red-100 text-red-900">Fuera de plazo</Badge>}
                </p>
                {r.details && <p className="mt-2 rounded-xl bg-cream-50 p-3 text-sm">{r.details}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/api/admin/privacidad/${r.id}`} className="btn-outline btn-sm">
                    Descargar sus datos (JSON)
                  </a>
                </div>
                <ActionForm action={resolveRequest} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea name="resolution" rows={2} className="input" placeholder="Cómo se ha resuelto (p. ej. «Enviada copia de datos el 12/10»)" maxLength={1000} />
                  <div className="flex flex-wrap gap-2">
                    <button name="intent" value="complete" className="btn-dark btn-sm">
                      Marcar como atendida
                    </button>
                    {r.type === "ERASURE" && (
                      <button name="intent" value="erase" className="btn-outline btn-sm text-red-700">
                        Ejecutar supresión
                      </button>
                    )}
                    <button name="intent" value="reject" className="btn-ghost btn-sm">
                      Rechazar (motivar)
                    </button>
                  </div>
                </ActionForm>
              </Card>
            );
          })}
          {closed.length > 0 && (
            <Card title="Últimas solicitudes cerradas">
              <ul className="space-y-1 text-sm">
                {closed.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span>
                      {TYPE[r.type]} · {r.status === "COMPLETED" ? "atendida" : "rechazada"}
                    </span>
                    <span className="text-cocoa-500">{r.resolvedAt ? formatDateTime(r.resolvedAt) : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card title="Conservación automática">
          <ul className="space-y-1 text-sm text-cocoa-700">
            <li>Pedidos: anonimizados a los {RETENTION.ordersYears} años</li>
            <li>Fotos de referencia: {RETENTION.referencePhotosDays} días tras el pedido</li>
            <li>Presupuestos no aceptados: {RETENTION.quotesNotAcceptedMonths} meses</li>
            <li>Carritos guardados: {RETENTION.abandonedCartsDays} días</li>
            <li>Clientes sin actividad ni consentimiento: {RETENTION.inactiveCustomersMonths} meses</li>
            <li>Intentos de acceso: {RETENTION.loginAttemptsDays} días</li>
            <li>Registro de actividad: {RETENTION.auditYears} años</li>
          </ul>
          <p className="mt-3 text-xs text-cocoa-500">Se aplica cada día de forma automática (tarea programada).</p>
        </Card>
      </div>
    </>
  );
}
