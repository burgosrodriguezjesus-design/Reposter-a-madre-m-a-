import http from "node:http";
import { describe, expect, it } from "vitest";
import { instrumentHttpServer, routeLabel } from "@/lib/http-metrics";
import { renderMetrics } from "@/lib/metrics";

describe("métricas HTTP", () => {
  it("la etiqueta route es de baja cardinalidad y sin datos personales", () => {
    expect(routeLabel("/", 200)).toBe("/");
    expect(routeLabel("/productos/tarta-de-queso?ref=x&email=ana@example.com", 200)).toBe("/productos/tarta-de-queso");
    expect(routeLabel("/pedido/cmb3x9k2a0001qz8l5v7w2abc?t=secreto", 200)).toBe("/pedido/:id");
    expect(routeLabel("/api/admin/privacidad/123", 200)).toBe("/api/admin/privacidad/:id");
    expect(routeLabel("/api/admin/privacidad/123/extra", 200)).toBe("/api/admin/privacidad/:id/…");
    expect(routeLabel("/_next/static/chunks/abc123.js", 200)).toBe("/_next/static");
    expect(routeLabel("/ruta-inventada-por-un-atacante", 404)).toBe("unmatched");
    expect(routeLabel("/%E0%A4%A", 400)).toBe("invalid");
  });

  it("mide peticiones reales del servidor HTTP de Node", async () => {
    instrumentHttpServer(http.Server.prototype);
    instrumentHttpServer(http.Server.prototype); // idempotente: no cuenta dos veces
    const server = http.createServer((req, res) => {
      res.statusCode = req.url?.startsWith("/falla") ? 503 : 200;
      res.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as { port: number };
    await fetch(`http://127.0.0.1:${port}/api/health`);
    await fetch(`http://127.0.0.1:${port}/falla`);
    await fetch(`http://127.0.0.1:${port}/falla`);
    await new Promise<void>((r) => server.close(() => r()));
    await new Promise((r) => setTimeout(r, 20));
    const text = await renderMetrics();
    expect(text).toContain('http_requests_total{method="GET",route="/api/health",status="200"} 1');
    expect(text).toContain('http_requests_total{method="GET",route="/falla",status="503"} 2');
    expect(text).toMatch(/http_request_duration_seconds_count\{route="\/falla"\} 2/);
  });

  // Último: llena el tope de rutas del módulo
  it("limita las rutas distintas por instancia", () => {
    for (let i = 0; i < 400; i++) routeLabel(`/x/ruta-${"abcdefghij"[i % 10]}${"klmnopqrst"[Math.floor(i / 10) % 10]}${"uvwxyz"[Math.floor(i / 100) % 6]}`, 200);
    expect(routeLabel("/una-ruta-nueva-mas", 200)).toBe("other");
  });
});
