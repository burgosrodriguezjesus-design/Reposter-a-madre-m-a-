import Link from "next/link";
import type { QuoteStatus } from "@prisma/client";
import { Badge, Empty, PageHeader, Tabs } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { QUOTE_STATUS } from "@/lib/order-status";
import { formatLocalDate, formatPrice } from "@/lib/format";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Presupuestos" };

export default async function QuotesPage({ searchParams }: PageProps<"/admin/presupuestos">) {
  await requirePermission("quotes.manage");
  const { estado } = await searchParams;
  const status = (Object.keys(QUOTE_STATUS) as QuoteStatus[]).includes(estado as QuoteStatus) ? (estado as QuoteStatus) : undefined;
  const [quotes, newCount] = await Promise.all([
    db.quoteRequest.findMany({ where: status ? { status } : { status: { in: ["NEW", "QUOTED"] } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.quoteRequest.count({ where: { status: "NEW" } }),
  ]);
  return (
    <>
      <PageHeader title="Presupuestos de tartas" description="Solicitudes de diseños especiales. Responde con un precio y el cliente podrá confirmar y pagar desde su enlace." />
      <Tabs
        active={status ? `/admin/presupuestos?estado=${status}` : "/admin/presupuestos"}
        items={[
          { href: "/admin/presupuestos", label: "Abiertos", count: newCount },
          ...(["ACCEPTED", "REJECTED", "EXPIRED"] as QuoteStatus[]).map((s) => ({ href: `/admin/presupuestos?estado=${s}`, label: QUOTE_STATUS[s].label })),
        ]}
      />
      {quotes.length ? (
        <div className="space-y-2">
          {quotes.map((q) => {
            const spec = q.spec as { summary?: { label: string; value: string }[] };
            const size = spec.summary?.find((s) => s.label === "Tamaño")?.value;
            return (
              <Link key={q.id} href={`/admin/presupuestos/${q.id}`} className="flex items-center gap-3 rounded-xl border border-sand-300/60 bg-white p-3 hover:border-blush-300">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{q.customerName}</strong>
                    <span className="text-xs text-cocoa-500">{q.number}</span>
                  </span>
                  <span className="block truncate text-sm text-cocoa-600">
                    Para el {formatLocalDate(q.desiredDate, "short")} · {size ?? ""}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Badge className={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                  <span className="text-sm font-semibold">{formatPrice(q.quotedCents ?? q.estimatedCents ?? 0)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty>No hay solicitudes en esta vista.</Empty>
      )}
    </>
  );
}
