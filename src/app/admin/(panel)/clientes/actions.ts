"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/admin";
import { eraseSubjectData } from "@/lib/privacy";
import { kickJobs } from "@/lib/job-handlers";

/**
 * Derecho de supresión (RGPD): la misma supresión que /admin/privacidad. Borra la ficha, los
 * recordatorios, carritos y presupuestos sin pedido; ANONIMIZA los pedidos cerrados (se
 * conservan importes por obligación contable) y deja intactos los pedidos aún en curso.
 */
export async function deleteCustomerData(formData: FormData) {
  const admin = await requirePermission("customers.delete");
  const id = str(formData, "id");
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) return;
  const result = await eraseSubjectData(customer.emailHash);
  await auditAdmin(admin, { action: "privacy.customer_erased", entity: "Customer", entityId: id, severity: "warning", details: { anonymizedOrders: result.anonymizedOrders, activeOrders: result.activeOrders, ...result.deleted } });
  kickJobs();
  revalidatePath("/admin/clientes");
}
