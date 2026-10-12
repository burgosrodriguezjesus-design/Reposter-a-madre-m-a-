import { readLocal } from "@/lib/storage";

/** Sirve las imágenes guardadas con STORAGE_DRIVER=local (desarrollo o servidor propio). */
export async function GET(_request: Request, { params }: RouteContext<"/uploads/[...path]">) {
  const { path } = await params;
  // Solo fotos públicas: las de clientes (private/, references/) nunca se sirven aquí
  if (!["products", "site", "categories"].includes(path[0] ?? "") || !path.every((p) => /^[\w-]+(\.webp)?$/.test(p)) || !path.at(-1)?.endsWith(".webp")) {
    return new Response("No encontrado", { status: 404 });
  }
  const data = await readLocal(path.join("/"));
  if (!data) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
