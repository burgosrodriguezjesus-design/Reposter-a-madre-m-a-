import { db } from "@/lib/db";
import { apiRequirePermission, auditAdmin } from "@/lib/auth";
import { exportSubjectData } from "@/lib/privacy";

/** Exportación de los datos de una persona (derecho de acceso y portabilidad). Solo propietario. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/privacidad/[id]">) {
  const admin = await apiRequirePermission("privacy.manage");
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const request = await db.dataRequest.findUnique({ where: { id } });
  if (!request || request.status === "UNVERIFIED") return Response.json({ error: "Solicitud no verificada" }, { status: 404 });
  const data = await exportSubjectData(request.emailHash);
  await auditAdmin(admin, { action: "privacy.export", entity: "DataRequest", entityId: id, severity: "warning" });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="datos-personales-${id}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
