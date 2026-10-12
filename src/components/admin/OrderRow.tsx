import Link from "next/link";
import type { Order } from "@prisma/client";
import { Store, Truck } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import { ORDER_STATUS } from "@/lib/order-status";
import { formatLocalDate, formatPrice } from "@/lib/format";

export function OrderRow({ order, itemsSummary }: { order: Order; itemsSummary?: string }) {
  const status = ORDER_STATUS[order.status];
  return (
    <Link
      href={`/admin/pedidos/${order.id}`}
      className="flex items-center gap-3 rounded-xl border border-sand-300/60 bg-white p-3 transition hover:border-blush-300 hover:shadow-soft"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-cocoa-700">
        {order.fulfillment === "PICKUP" ? <Store className="size-5" /> : <Truck className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-cocoa-900">{order.customerName}</strong>
          <span className="text-xs text-cocoa-500">{order.number}</span>
          {order.requiresReview && <Badge className="bg-gold-200 text-gold-700">Personalizado</Badge>}
        </span>
        <span className="block truncate text-sm text-cocoa-600">
          {formatLocalDate(order.scheduledDate, "short")} · {order.scheduledTime}
          {itemsSummary ? ` · ${itemsSummary}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge className={status.tone}>{status.label}</Badge>
        <span className="text-sm font-semibold text-cocoa-900">{formatPrice(order.totalCents)}</span>
      </span>
    </Link>
  );
}
