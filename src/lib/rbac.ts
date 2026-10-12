import type { AdminRole } from "@prisma/client";

/**
 * Control de acceso basado en roles. Cada página y acción del panel comprueba en el servidor
 * el permiso concreto que necesita (`requirePermission`). Mínimo privilegio:
 *  - STAFF (empleado): pedidos y calendario del día a día; sin exportaciones ni ajustes.
 *  - MANAGER (encargado): además catálogo, precios, presupuestos, marketing y opiniones.
 *  - OWNER (propietario): todo, incluidos usuarios, ajustes, privacidad, auditoría y exportaciones.
 */
export const PERMISSIONS = [
  "orders.view",
  "orders.update",
  "orders.cancel",
  "orders.payment",
  "orders.refund",
  "quotes.manage",
  "calendar.view",
  "calendar.manage",
  "catalog.manage",
  "delivery.manage",
  "marketing.manage",
  "giftcards.manage",
  "reviews.manage",
  "customers.view",
  "customers.export",
  "customers.delete",
  "stats.view",
  "settings.manage",
  "users.manage",
  "audit.view",
  "privacy.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF: Permission[] = ["orders.view", "orders.update", "calendar.view"];
const MANAGER: Permission[] = [
  ...STAFF,
  "orders.cancel",
  "orders.payment",
  "quotes.manage",
  "calendar.manage",
  "catalog.manage",
  "delivery.manage",
  "marketing.manage",
  "giftcards.manage",
  "reviews.manage",
  "customers.view",
  "stats.view",
];

export const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<Permission>> = {
  STAFF: new Set(STAFF),
  MANAGER: new Set(MANAGER),
  OWNER: new Set(PERMISSIONS),
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: "Propietario",
  MANAGER: "Encargado",
  STAFF: "Empleado",
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
