/**
 * Tras `next build`: comprueba que ninguna página con CSP estricta (lista STRICT de src/proxy.ts)
 * se ha generado como estática. Una página estática no lleva el nonce de la petición y el
 * navegador bloquearía sus propios scripts (la página dejaría de funcionar).
 *   node scripts/check-csp-routes.mjs
 */
import { readFileSync } from "node:fs";

const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
const list = /const STRICT = \[([^\]]+)\]/.exec(proxy)?.[1];
if (!list) throw new Error("No se encuentra la lista STRICT en src/proxy.ts");
const strict = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const manifest = JSON.parse(readFileSync(new URL("../.next/prerender-manifest.json", import.meta.url), "utf8"));
const staticRoutes = Object.keys(manifest.routes ?? {});
const matches = (route, prefix) => route === prefix || route.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
const bad = staticRoutes.filter((r) => strict.some((p) => matches(r, p.replace(/\/$/, "")) || matches(r, p)));

if (bad.length) {
  console.error(`✗ Páginas con CSP estricta generadas como estáticas (sus scripts se bloquearían): ${bad.join(", ")}`);
  console.error("  Añade `await connection()` (next/server) a esas páginas o sácalas de STRICT en src/proxy.ts.");
  process.exit(1);
}
console.log(`✓ ${strict.length} prefijos con CSP estricta; ninguna página estática afectada (${staticRoutes.length} estáticas revisadas).`);
