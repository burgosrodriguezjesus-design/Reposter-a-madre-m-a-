import "server-only";
import { cookies } from "next/headers";

/**
 * Acceso sin cuenta a un pedido o presupuesto: el enlace del email lleva un token secreto que
 * el proxy canjea por una cookie HttpOnly limitada a esa página y lo quita de la URL
 * (así no queda en el historial, en cabeceras Referer ni en registros de terceros).
 */
export const accessCookieName = (kind: "pedido" | "presupuesto", id: string) => `acc_${kind === "pedido" ? "o" : "q"}_${id}`;

export async function accessTokenFor(kind: "pedido" | "presupuesto", id: string, fromQuery: unknown): Promise<string> {
  const jar = await cookies();
  const cookie = jar.get(accessCookieName(kind, id))?.value;
  if (cookie) return cookie;
  return typeof fromQuery === "string" ? fromQuery : "";
}
