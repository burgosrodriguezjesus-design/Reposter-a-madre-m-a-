"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menú principal: mayúsculas espaciadas; la sección actual en oro (aria-current). */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Principal" className="hidden items-center gap-6 xl:flex 2xl:gap-8">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="nav-link" aria-current={isCurrent(link.href) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
