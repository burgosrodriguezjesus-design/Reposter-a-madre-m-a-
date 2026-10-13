import { readPrivate, verifyMediaSignature } from "@/lib/storage";
import { penalizeClient } from "@/lib/rate-limit";

/**
 * Fotos privadas de clientes (referencias de tartas). Solo con URL firmada y vigente
 * (la generan las páginas del panel o del propio pedido del cliente). Nunca en cachés compartidas.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ref = params.get("ref") ?? "";
  if (!verifyMediaSignature(ref, params.get("exp") ?? "", params.get("sig") ?? "")) {
    await penalizeClient(1);
    return new Response("Enlace caducado o no válido", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const data = await readPrivate(ref);
  if (!data) return new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    },
  });
}
