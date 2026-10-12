import type { OrderStatus, PaymentMethod, PaymentStatus, QuoteStatus } from "@prisma/client";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: string; customerText: string }> = {
  PENDING_PAYMENT: {
    label: "Esperando pago",
    tone: "bg-amber-100 text-amber-900",
    customerText: "Estamos esperando la confirmación del pago.",
  },
  PENDING: {
    label: "Pendiente",
    tone: "bg-blush-100 text-blush-800",
    customerText: "Hemos recibido tu pedido y lo estamos revisando. Te avisaremos en cuanto lo confirmemos.",
  },
  ACCEPTED: {
    label: "Aceptado",
    tone: "bg-sky-100 text-sky-900",
    customerText: "¡Pedido confirmado! Ya lo tenemos en nuestra agenda.",
  },
  IN_PREPARATION: {
    label: "En preparación",
    tone: "bg-violet-100 text-violet-900",
    customerText: "Estamos preparando tu pedido en el obrador.",
  },
  READY: {
    label: "Listo",
    tone: "bg-emerald-100 text-emerald-900",
    customerText: "Tu pedido está listo.",
  },
  DELIVERED: {
    label: "Entregado",
    tone: "bg-stone-200 text-stone-800",
    customerText: "Pedido entregado. ¡Que lo disfrutéis!",
  },
  REJECTED: {
    label: "Rechazado",
    tone: "bg-red-100 text-red-900",
    customerText: "Lo sentimos, no podemos atender este pedido.",
  },
  CANCELLED: {
    label: "Cancelado",
    tone: "bg-stone-200 text-stone-700",
    customerText: "Este pedido se ha cancelado.",
  },
};

/** Flujo principal que ve el cliente en el seguimiento. */
export const STATUS_FLOW: OrderStatus[] = ["PENDING", "ACCEPTED", "IN_PREPARATION", "READY", "DELIVERED"];

/** Transiciones permitidas desde el panel. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["IN_PREPARATION", "READY", "CANCELLED"],
  IN_PREPARATION: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: "Tarjeta (online)",
  IN_STORE: "Pago en tienda",
  GIFT_CARD: "Tarjeta regalo",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Pendiente de pago",
  PAID: "Pagado",
  REFUNDED: "Reembolsado",
  FAILED: "Pago fallido",
};

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: string }> = {
  NEW: { label: "Nueva", tone: "bg-blush-100 text-blush-800" },
  QUOTED: { label: "Presupuesto enviado", tone: "bg-sky-100 text-sky-900" },
  ACCEPTED: { label: "Aceptado", tone: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "Rechazado", tone: "bg-red-100 text-red-900" },
  EXPIRED: { label: "Caducado", tone: "bg-stone-200 text-stone-700" },
};

/** Estados que ocupan capacidad en el calendario y cuentan como venta. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["PENDING", "ACCEPTED", "IN_PREPARATION", "READY", "DELIVERED"];
