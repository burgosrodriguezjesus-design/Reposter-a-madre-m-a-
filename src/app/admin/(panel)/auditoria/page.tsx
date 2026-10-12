import Link from "next/link";
import clsx from "clsx";
import { Badge, Card, Empty, PageHeader } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { VerifyButton } from "./VerifyButton";

export const metadata = { title: "Registro de actividad" };

const FILTERS = [
  { key: "", label: "Todo" },
  { key: "auth.", label: "Accesos" },
  { key: "order.", label: "Pedidos" },
  { key: "product.", label: "Productos y precios" },
  { key: "users.", label: "Usuarios" },
  { key: "privacy.", label: "Privacidad" },
  { key: "settings.", label: "Ajustes" },
];

export default async function AuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const admin = await requirePermission("audit.view");
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.tipo)?.key ?? "";
  const severity = params.nivel === "alertas" ? ["warning", "alert"] : undefined;
  const page = Math.max(0, Math.min(200, Number(params.p) || 0));
  const entries = await db.auditLog.findMany({
    where: { ...(filter ? { action: { startsWith: filter } } : {}), ...(severity ? { severity: { in: severity } } : {}) },
    orderBy: { seq: "desc" },
    skip: page * 100,
    take: 100,
  });
  await auditAdmin(admin, { action: "audit.viewed", details: { filter, page } });
  const href = (q: Record<string, string>) => `/admin/auditoria?${new URLSearchParams({ ...(filter ? { tipo: filter } : {}), ...(severity ? { nivel: "alertas" } : {}), ...q })}`;

  return (
    <>
      <PageHeader
        title="Registro de actividad"
        description="Quién hizo qué y cuándo en el panel. No se puede modificar ni borrar: cada entrada está encadenada criptográficamente con la anterior."
      />
      <Card title="Integridad">
        <VerifyButton />
      </Card>
      <div className="my-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/auditoria?${new URLSearchParams({ ...(f.key ? { tipo: f.key } : {}), ...(severity ? { nivel: "alertas" } : {}) })}`} className={clsx("chip", f.key === filter && "bg-cocoa-800 text-cream-50")}>
            {f.label}
          </Link>
        ))}
        <Link href={href({ nivel: severity ? "" : "alertas" })} className={clsx("chip", severity && "bg-red-700 text-white")}>
          Solo avisos y alertas
        </Link>
      </div>
      {entries.length === 0 ? (
        <Empty>Sin entradas.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-sand-300/60 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-cream-100 text-xs text-cocoa-600">
              <tr>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Elemento</th>
                <th className="px-3 py-2">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-300/50">
              {entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2 text-cocoa-500">{e.seq}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                  <td className="px-3 py-2">{e.actorEmail ?? <span className="text-cocoa-400">sistema / visitante</span>}</td>
                  <td className="px-3 py-2">
                    {e.action}{" "}
                    {e.severity !== "info" && <Badge className={e.severity === "alert" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}>{e.severity}</Badge>}
                  </td>
                  <td className="px-3 py-2 text-xs text-cocoa-600">
                    {e.entity}
                    {e.entityId ? ` ${e.entityId.slice(0, 10)}…` : ""}
                  </td>
                  <td className="max-w-xs px-3 py-2 font-mono text-[11px] break-all text-cocoa-600">{e.details ? JSON.stringify(e.details).slice(0, 300) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {page > 0 && (
          <Link href={href({ p: String(page - 1) })} className="btn-outline btn-sm">
            Más recientes
          </Link>
        )}
        {entries.length === 100 && (
          <Link href={href({ p: String(page + 1) })} className="btn-outline btn-sm">
            Anteriores
          </Link>
        )}
      </div>
    </>
  );
}
