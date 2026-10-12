"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Gift,
  House,
  LayoutGrid,
  Menu,
  MessageSquare,
  MessageSquareQuote,
  Package,
  Palette,
  Percent,
  Settings,
  Star,
  Truck,
  Users,
  X,
} from "lucide-react";

type Counts = { orders: number; quotes: number; reviews: number };

const GROUPS = [
  {
    title: "Día a día",
    items: [
      { href: "/admin", label: "Inicio", icon: House, exact: true },
      { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, count: "orders" as const },
      { href: "/admin/presupuestos", label: "Presupuestos", icon: MessageSquareQuote, count: "quotes" as const },
      { href: "/admin/calendario", label: "Calendario y horario", icon: CalendarDays },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/admin/productos", label: "Productos", icon: Package },
      { href: "/admin/categorias", label: "Categorías", icon: LayoutGrid },
      { href: "/admin/personalizador", label: "Personalizador", icon: Palette },
      { href: "/admin/reparto", label: "Zonas de reparto", icon: Truck },
    ],
  },
  {
    title: "Clientes y ventas",
    items: [
      { href: "/admin/marketing", label: "Promociones y cupones", icon: Percent },
      { href: "/admin/tarjetas-regalo", label: "Tarjetas regalo", icon: Gift },
      { href: "/admin/opiniones", label: "Opiniones", icon: Star, count: "reviews" as const },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
      { href: "/admin/ajustes", label: "Ajustes", icon: Settings },
    ],
  },
];

const BOTTOM = [
  { href: "/admin", label: "Inicio", icon: House, exact: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, count: "orders" as const },
  { href: "/admin/presupuestos", label: "Presupuestos", icon: MessageSquare, count: "quotes" as const },
  { href: "/admin/productos", label: "Productos", icon: Package },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ n, light = false }: { n: number; light?: boolean }) {
  if (!n) return null;
  return (
    <span className={clsx("ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold", light ? "bg-white text-blush-700" : "bg-blush-600 text-white")}>
      {n}
    </span>
  );
}

function NavList({ counts, onNavigate }: { counts: Counts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6" aria-label="Panel">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-2 px-3 text-[11px] font-semibold tracking-widest text-cocoa-400 uppercase">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition",
                      active ? "bg-cocoa-800 text-cream-50" : "text-cocoa-700 hover:bg-cream-200",
                    )}
                  >
                    <item.icon className="size-[18px]" strokeWidth={1.8} />
                    {item.label}
                    {"count" in item && item.count && <CountBadge n={counts[item.count]} light={active} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({ counts, footer }: { counts: Counts; footer: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 print:hidden shrink-0 flex-col overflow-y-auto border-r border-sand-300/70 bg-cream-50 p-4 lg:flex">
      <NavList counts={counts} />
      <div className="mt-auto pt-6">{footer}</div>
    </aside>
  );
}

export function AdminMobileNav({ counts, footer }: { counts: Counts; footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // Los elementos fijos se montan en <body>: la cabecera usa backdrop-filter, que los recortaría.
  const portal = (node: React.ReactNode) => (mounted ? createPortal(node, document.body) : null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-cream-200 lg:hidden" aria-label="Abrir menú">
        <Menu className="size-6" />
      </button>
      {open &&
        portal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-cocoa-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-cream-50 p-4 shadow-lift">
            <button type="button" onClick={() => setOpen(false)} className="mb-4 ml-auto inline-flex size-11 items-center justify-center rounded-full hover:bg-cream-200" aria-label="Cerrar menú">
              <X className="size-6" />
            </button>
            <NavList counts={counts} onNavigate={() => setOpen(false)} />
            <div className="mt-auto pt-6">{footer}</div>
          </div>
        </div>,
        )}
      {portal(
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 print:hidden border-t border-sand-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Accesos rápidos">
        {BOTTOM.map((item) => {
          const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
          return (
            <Link key={item.href} href={item.href} className={clsx("relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", active ? "text-blush-700" : "text-cocoa-500")}>
              <item.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              {item.label}
              {"count" in item && item.count && counts[item.count] > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-blush-600 px-1 text-[10px] font-bold text-white">{counts[item.count]}</span>
              )}
            </Link>
          );
        })}
      </nav>,
      )}
    </>
  );
}
