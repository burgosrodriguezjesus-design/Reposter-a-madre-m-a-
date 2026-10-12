"use client";

import { useSyncExternalStore } from "react";
import type { CartLine } from "@/lib/cart-types";

/** Carrito guardado en el navegador (localStorage), sincronizado entre pestañas. */
const KEY = "rmm-cart-v1";
const EMPTY: CartLine[] = [];
let lines: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CartLine[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    lines = read();
    loaded = true;
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* almacenamiento lleno o bloqueado: el carrito sigue en memoria */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      lines = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function sameConfig(a: CartLine, b: Omit<CartLine, "key">) {
  return (
    a.kind === "product" &&
    b.kind === "product" &&
    a.productId === b.productId &&
    (a.variantId ?? null) === (b.variantId ?? null) &&
    JSON.stringify(a.options) === JSON.stringify(b.options) &&
    (a.dedication ?? "") === (b.dedication ?? "") &&
    (a.referencePhotoUrl ?? "") === (b.referencePhotoUrl ?? "")
  );
}

export const cart = {
  add(line: Omit<CartLine, "key">) {
    ensureLoaded();
    const existing = lines.find((l) => sameConfig(l, line));
    if (existing) {
      commit(
        lines.map((l) =>
          l === existing ? { ...l, quantity: Math.min(l.maxPerOrder, l.quantity + line.quantity) } : l,
        ),
      );
    } else {
      commit([...lines, { ...line, key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` }]);
    }
  },
  setQuantity(key: string, quantity: number) {
    ensureLoaded();
    commit(
      lines
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(0, Math.min(l.maxPerOrder, quantity)) } : l))
        .filter((l) => l.quantity > 0),
    );
  },
  remove(key: string) {
    ensureLoaded();
    commit(lines.filter((l) => l.key !== key));
  },
  clear() {
    commit(EMPTY);
  },
  replace(next: CartLine[]) {
    commit(next);
  },
};

export function useCart() {
  const current = useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return lines;
    },
    () => EMPTY,
  );
  const count = current.reduce((n, l) => n + l.quantity, 0);
  const subtotalCents = current.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  return { lines: current, count, subtotalCents };
}
