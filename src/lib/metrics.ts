/**
 * Métricas en formato Prometheus (por instancia). Las expone /api/metrics con token.
 * Sin etiquetas con datos personales ni de alta cardinalidad (nada de emails, IPs o ids).
 */
type Labels = Record<string, string>;
type Counter = Map<string, number>;

const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const globalForMetrics = globalThis as unknown as {
  metrics?: {
    counters: Map<string, Counter>;
    gauges: Map<string, () => number | Promise<number>>;
    histograms: Map<string, Map<string, { buckets: number[]; sum: number; count: number }>>;
    help: Map<string, string>;
  };
};

const m = (globalForMetrics.metrics ??= { counters: new Map(), gauges: new Map(), histograms: new Map(), help: new Map() });

function key(labels?: Labels): string {
  if (!labels) return "";
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v).replace(/["\\\n]/g, "_").slice(0, 60)}"`)
    .join(",");
}

export function inc(name: string, labels?: Labels, by = 1, help?: string) {
  if (help) m.help.set(name, help);
  const c = m.counters.get(name) ?? new Map<string, number>();
  const k = key(labels);
  c.set(k, (c.get(k) ?? 0) + by);
  m.counters.set(name, c);
}

export function observe(name: string, seconds: number, labels?: Labels) {
  const h = m.histograms.get(name) ?? new Map();
  const k = key(labels);
  const entry = h.get(k) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
  BUCKETS.forEach((b, i) => {
    if (seconds <= b) entry.buckets[i]++;
  });
  entry.sum += seconds;
  entry.count++;
  h.set(k, entry);
  m.histograms.set(name, h);
}

export function registerGauge(name: string, fn: () => number | Promise<number>, help?: string) {
  if (help) m.help.set(name, help);
  m.gauges.set(name, fn);
}

export async function renderMetrics(): Promise<string> {
  const lines: string[] = [];
  const mem = process.memoryUsage();
  lines.push(`process_resident_memory_bytes ${mem.rss}`, `nodejs_heap_size_used_bytes ${mem.heapUsed}`, `process_uptime_seconds ${Math.round(process.uptime())}`);
  for (const [name, c] of m.counters) {
    if (m.help.has(name)) lines.push(`# HELP ${name} ${m.help.get(name)}`);
    lines.push(`# TYPE ${name} counter`);
    for (const [k, v] of c) lines.push(`${name}${k ? `{${k}}` : ""} ${v}`);
  }
  for (const [name, h] of m.histograms) {
    lines.push(`# TYPE ${name} histogram`);
    for (const [k, e] of h) {
      const sep = k ? `${k},` : "";
      BUCKETS.forEach((b, i) => lines.push(`${name}_bucket{${sep}le="${b}"} ${e.buckets[i]}`));
      lines.push(`${name}_bucket{${sep}le="+Inf"} ${e.count}`, `${name}_sum${k ? `{${k}}` : ""} ${e.sum}`, `${name}_count${k ? `{${k}}` : ""} ${e.count}`);
    }
  }
  for (const [name, fn] of m.gauges) {
    try {
      const v = await fn();
      if (m.help.has(name)) lines.push(`# HELP ${name} ${m.help.get(name)}`);
      lines.push(`# TYPE ${name} gauge`, `${name} ${v}`);
    } catch {
      // Una métrica que falla no debe romper el resto
    }
  }
  return `${lines.join("\n")}\n`;
}
