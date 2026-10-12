import type { Metadata } from "next";
import { CartView } from "@/components/site/CartView";

export const metadata: Metadata = {
  title: "Tu carrito",
  robots: { index: false, follow: true },
  alternates: { canonical: "/carrito" },
};

export default function CartPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="font-display text-4xl text-cocoa-900 sm:text-5xl">Tu carrito</h1>
      <CartView />
    </div>
  );
}
