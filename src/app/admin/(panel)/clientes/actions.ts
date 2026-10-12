"use server";

import { revalidatePath } from "next/cache";
import { auditAdmin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/admin";

/**
 * Derecho de supresión (RGPD): elimina la ficha de cliente, sus recordatorios y carritos.
 * Los pedidos se conservan (obligación legal de facturación) pero se desvinculan.
 */
export async function deleteCustomerData(formData: FormData) {
  const admin = await requirePermission("customers.delete");
  const id = str(formData, "id");
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) return;
  await db.$transaction([
    db.order.updateMany({ where: { customerId: id }, data: { customerId: null, marketingConsent: false } }),
    db.abandonedCart.deleteMany({ where: { emailHash: customer.emailHash } }),
    db.customer.delete({ where: { id } }),
  ]);
  await auditAdmin(admin, { action: "privacy.customer_erased", entity: "Customer", entityId: id, severity: "warning" });
  revalidatePath("/admin/clientes");
}
