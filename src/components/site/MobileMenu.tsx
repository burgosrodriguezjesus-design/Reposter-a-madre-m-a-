"use client";

import { Menu, Phone, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { telLink } from "@/lib/format";

type LinkItem = { href: string; label: string };

export function MobileMenu({ links, categories, phone }: { links: LinkItem[]; categories: LinkItem[]; phone: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // Cierra el menú al navegar
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-11 items-center justify-center rounded-full text-cocoa-800 hover:bg-white"
        aria-label="Abrir menú"
        aria-expanded={open}
      >
        <Menu className="size-6" strokeWidth={1.7} />
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-cocoa-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col overflow-y-auto bg-cream-50 p-6 shadow-lift animate-fade-up">
            <div className="mb-6 flex items-center justify-between">
              <span className="eyebrow">Menú</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-cream-200"
                aria-label="Cerrar menú"
              >
                <X className="size-6" />
              </button>
            </div>
            <nav aria-label="Menú móvil" className="space-y-1">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-xl px-3 py-3 font-display text-xl text-cocoa-900 hover:bg-cream-200">
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 border-t border-sand-300 pt-5">
              <p className="eyebrow mb-3">Categorías</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Link key={c.href} href={c.href} className="chip">
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-auto space-y-3 pt-8">
              <Link href="/productos" className="btn-primary w-full">
                Hacer pedido
              </Link>
              <a href={telLink(phone)} className="btn-outline w-full">
                <Phone className="size-4" /> {phone}
              </a>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
