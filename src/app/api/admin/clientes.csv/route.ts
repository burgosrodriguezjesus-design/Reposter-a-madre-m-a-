import { getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Exporta solo los clientes que han dado su consentimiento para recibir comunicaciones. */
export async function GET() {
  if (!(await getAdmin())) return new Response("No autorizado", { status: 401 });
  const customers = await db.customer.findMany({ where: { marketingConsent: true }, orderBy: { createdAt: "asc" } });
  const escape = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["nombre", "email", "telefono", "consentimiento_fecha", "pedidos"].join(";"),
    ...customers.map((c) => [escape(c.name), escape(c.email), escape(c.phone), escape(c.marketingConsentAt?.toISOString()), c.ordersCount].join(";")),
  ];
  return new Response(`﻿${rows.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-con-consentimiento.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
