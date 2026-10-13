import { apiRequirePermission, auditAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { securityAlert } from "@/lib/alerts";

/** Evita la inyección de fórmulas al abrir el CSV en Excel/LibreOffice (=, +, -, @...). */
function cell(v: string | number | null | undefined): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Exporta solo los clientes que han dado su consentimiento para recibir comunicaciones. Solo propietario. */
export async function GET() {
  const admin = await apiRequirePermission("customers.export");
  if (admin instanceof Response) return admin;
  const customers = await db.customer.findMany({ where: { marketingConsent: true }, orderBy: { createdAt: "asc" } });
  await auditAdmin(admin, { action: "customers.export", entity: "Customer", severity: "warning", details: { rows: customers.length } });
  await securityAlert("admin.export", "Se ha exportado la lista de clientes con consentimiento.", { userId: admin.id, rows: customers.length });
  const rows = [
    ["nombre", "email", "telefono", "consentimiento_fecha", "pedidos"].join(";"),
    ...customers.map((c) => [cell(c.name), cell(c.email), cell(c.phone), cell(c.marketingConsentAt?.toISOString()), c.ordersCount].join(";")),
  ];
  return new Response(`\uFEFF${rows.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-con-consentimiento.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
