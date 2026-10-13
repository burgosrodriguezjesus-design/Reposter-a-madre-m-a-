import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { inc, observe } from "@/lib/metrics";

/**
 * Métricas HTTP por instancia para Prometheus (infra/monitoring: SLO de disponibilidad y latencia):
 *   http_requests_total{route,method,status}  ·  http_request_duration_seconds{route}
 * Se miden en el servidor HTTP de Node (todas las respuestas, también las de error y las que
 * corta proxy.ts), no en cada ruta.
 *
 * La etiqueta "route" es de BAJA cardinalidad y nunca lleva datos personales: sin query string,
 * los identificadores y tokens se sustituyen por ":id", las 404 se agrupan en "unmatched" (si no,
 * cualquiera podría crear series nuevas pidiendo rutas inventadas) y hay un tope de rutas
 * distintas por instancia.
 */
const MAX_ROUTES = 300;
const MAX_DEPTH = 4;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const seen = new Set<string>();

function isIdLike(segment: string): boolean {
  return segment.length > 24 || /\d/.test(segment) || /^[A-Za-z0-9_-]{16,}$/.test(segment);
}

export function routeLabel(url: string | undefined, status: number): string {
  if (status === 404) return "unmatched";
  let path = (url ?? "/").split("?")[0].split("#")[0] || "/";
  if (path.startsWith("/_next/static/")) return "/_next/static";
  if (path.startsWith("/_next/image")) return "/_next/image";
  if (path.startsWith("/_next/")) return "/_next";
  try {
    path = decodeURIComponent(path);
  } catch {
    return "invalid";
  }
  const segments = path.split("/").filter(Boolean);
  const kept = segments.slice(0, MAX_DEPTH).map((s) => (isIdLike(s) ? ":id" : s.toLowerCase().replace(/[^a-z0-9._-]/g, "_")));
  let route = `/${kept.join("/")}${segments.length > MAX_DEPTH ? "/…" : ""}`;
  if (!seen.has(route)) {
    if (seen.size >= MAX_ROUTES) route = "other";
    else seen.add(route);
  }
  return route;
}

export function recordHttp(req: Pick<IncomingMessage, "url" | "method">, res: Pick<ServerResponse, "statusCode">, seconds: number) {
  const status = res.statusCode || 0;
  const route = routeLabel(req.url, status);
  const method = METHODS.has(req.method ?? "") ? (req.method as string) : "OTHER";
  inc("http_requests_total", { route, method, status: String(status) }, 1, "Peticiones HTTP atendidas por esta instancia");
  observe("http_request_duration_seconds", seconds, { route });
}

/** Engancha el evento "request" de los servidores HTTP de Node (una sola vez por proceso). */
export function instrumentHttpServer(proto: Server) {
  const target = proto as Server & { __rmmMetrics?: boolean };
  if (target.__rmmMetrics) return;
  target.__rmmMetrics = true;
  const emit = target.emit;
  target.emit = function (this: Server, event: string | symbol, ...args: unknown[]) {
    if (event === "request") {
      const [req, res] = args as [IncomingMessage, ServerResponse];
      const start = process.hrtime.bigint();
      res.once("close", () => recordHttp(req, res, Number(process.hrtime.bigint() - start) / 1e9));
    }
    return Reflect.apply(emit, this, [event, ...args]) as boolean;
  } as Server["emit"];
}

