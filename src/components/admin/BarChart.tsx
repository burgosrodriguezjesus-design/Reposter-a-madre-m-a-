import { formatPrice } from "@/lib/format";

/**
 * Gráfico de barras de una sola serie (HTML puro, sin dependencias).
 * Un solo color, barras finas con extremos redondeados apoyadas en la base,
 * eje recesivo, etiqueta de valor solo en el máximo y tooltip al pasar o enfocar.
 */
export function BarChart({ data, title }: { data: { label: string; value: number; orders: number }[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const ticks = [1, 0.5];
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="relative h-56 pl-14">
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 left-14 border-t border-dashed border-sand-300" style={{ bottom: `${t * 100}%` }}>
            <span className="absolute -top-2.5 -left-14 w-12 text-right text-[11px] text-cocoa-500">{formatPrice(Math.round(max * t)).replace(",00", "")}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-14 flex items-end gap-[2px] border-b border-sand-400">
          {data.map((d, i) => (
            <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0} aria-label={`${d.label}: ${formatPrice(d.value)}, ${d.orders} pedidos`}>
              <div
                className="w-full max-w-7 rounded-t-[4px] bg-blush-500 transition-colors group-hover:bg-blush-700 group-focus:bg-blush-700"
                style={{ height: `${Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * 100)}%` }}
              />
              {i === peak && d.value > 0 && (
                <span className="pointer-events-none absolute -translate-y-1 text-[11px] font-semibold whitespace-nowrap text-cocoa-700" style={{ bottom: `${(d.value / max) * 100}%` }}>
                  {formatPrice(d.value).replace(",00", "")}
                </span>
              )}
              <span className="pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-lg bg-cocoa-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-cream-50 shadow-lift group-hover:block group-focus:block">
                <strong>{d.label}</strong>
                <br />
                {formatPrice(d.value)} · {d.orders} pedido{d.orders === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] pl-14 text-[10px] text-cocoa-500">
        {data.map((d, i) => (
          <span key={d.label} className="flex-1 truncate text-center">
            {data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-cocoa-600">Ver datos en tabla</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-cocoa-500">
            <tr>
              <th className="py-1 font-medium">Periodo</th>
              <th className="py-1 text-right font-medium">Pedidos</th>
              <th className="py-1 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-sand-300/50">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{d.orders}</td>
                <td className="py-1 text-right">{formatPrice(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
