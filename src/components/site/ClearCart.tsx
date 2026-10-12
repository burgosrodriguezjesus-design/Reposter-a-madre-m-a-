"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cart } from "@/lib/cart-store";

/** Vacía el carrito tras confirmar el pedido y, si el pago se está confirmando, refresca la página. */
export function ClearCart({ refreshWhilePending = false }: { refreshWhilePending?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    cart.clear();
  }, []);
  useEffect(() => {
    if (!refreshWhilePending) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [refreshWhilePending, router]);
  return null;
}
