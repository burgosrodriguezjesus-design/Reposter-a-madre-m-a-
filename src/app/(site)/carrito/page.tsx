import type { Metadata } from "next";
import { connection } from "next/server";
import { CartView } from "@/components/site/CartView";

export const metadata: Metadata = {
  title: "Tu carrito",
  robots: { index: false, follow: true },
  alternates: { canonical: "/carrito" },
};

export default async function CartPage() {
  // Página con CSP estricta (nonce por petición, ver proxy.ts): debe generarse en cada visita.
  // Si fuera estática, el HTML no llevaría el nonce y el navegador bloquearía sus scripts.
  await connection();
  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Tu carrito</h1>
      <CartView />
    </div>
  );
}
