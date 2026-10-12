"use client";

import { useActionState, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { Check, ChefHat, PackageCheck, Truck, X, Ban } from "lucide-react";
import { ResultMessage, SubmitButton } from "@/components/admin/forms";
import { ORDER_STATUS } from "@/lib/order-status";
import { updateOrderStatus } from "../actions";

const ICONS: Partial<Record<OrderStatus, typeof Check>> = {
  ACCEPTED: Check,
  IN_PREPARATION: ChefHat,
  READY: PackageCheck,
  DELIVERED: Truck,
  REJECTED: X,
  CANCELLED: Ban,
};

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "Aceptar pedido",
  IN_PREPARATION: "En preparación",
  READY: "Marcar como listo",
  DELIVERED: "Entregado",
  REJECTED: "Rechazar",
  CANCELLED: "Cancelar pedido",
};

export function StatusPanel({ orderId, next, canRefund }: { orderId: string; next: OrderStatus[]; canRefund: boolean }) {
  const [result, action] = useActionState(updateOrderStatus, null);
  const [target, setTarget] = useState<OrderStatus | null>(null);
  if (next.length === 0) return <p className="text-sm text-cocoa-500">Este pedido está cerrado.</p>;
  const negative = target === "REJECTED" || target === "CANCELLED";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid grid-cols-2 gap-2">
        {next.map((s) => {
          const Icon = ICONS[s] ?? Check;
          const bad = s === "REJECTED" || s === "CANCELLED";
          return (
            <label
              key={s}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                target === s
                  ? bad
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-blush-600 bg-blush-600 text-white"
                  : bad
                    ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                    : "border-sand-300 bg-white text-cocoa-800 hover:border-blush-300"
              }`}
            >
              <input type="radio" name="status" value={s} className="sr-only" onChange={() => setTarget(s)} checked={target === s} />
              <Icon className="size-4" /> {ACTION_LABEL[s] ?? ORDER_STATUS[s].label}
            </label>
          );
        })}
      </div>
      {target && (
        <>
          <label className="block">
            <span className="label">{negative ? "Motivo (se envía al cliente)" : "Nota para el cliente (opcional)"}</span>
            <textarea name="note" rows={2} className="input" required={target === "REJECTED"} placeholder={negative ? "Lo sentimos, ese día…" : "Ej.: ¡Ya está lista! Te esperamos."} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify" defaultChecked className="size-4 accent-blush-600" /> Avisar al cliente por email
          </label>
          {negative && canRefund && (
            <label className="flex items-center gap-2 text-sm font-medium text-red-800">
              <input type="checkbox" name="refund" defaultChecked className="size-4 accent-red-600" /> Reembolsar el pago con tarjeta (Stripe)
            </label>
          )}
          <SubmitButton className={negative ? "btn w-full bg-red-600 text-white hover:bg-red-700" : "btn-primary w-full"}>
            Confirmar: {ACTION_LABEL[target] ?? ORDER_STATUS[target].label}
          </SubmitButton>
        </>
      )}
      <ResultMessage result={result} />
    </form>
  );
}
