"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-store";

export function CartButton() {
  const { count } = useCart();
  return (
    <Link
      href="/carrito"
      className="relative inline-flex size-11 items-center justify-center rounded-full text-cocoa-800 transition hover:bg-white"
      aria-label={count ? `Carrito, ${count} productos` : "Carrito vacío"}
    >
      <ShoppingBag className="size-[22px]" strokeWidth={1.7} />
      {count > 0 && (
        <span className="absolute top-1 right-0.5 flex min-w-5 items-center justify-center rounded-full bg-blush-600 px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
