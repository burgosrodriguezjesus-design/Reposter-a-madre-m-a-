import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { BrandMark } from "@/components/icons";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const [orders, quotes, reviews, settings] = await Promise.all([
    db.order.count({ where: { status: "PENDING" } }),
    db.quoteRequest.count({ where: { status: "NEW" } }),
    db.review.count({ where: { status: "PENDING" } }),
    getSettings(),
  ]);
  const counts = { orders, quotes, reviews };
  const footer = (
    <div className="space-y-1 border-t border-sand-300/70 pt-4 text-sm">
      <p className="truncate px-3 text-cocoa-500">{admin.email}</p>
      <Link href="/" target="_blank" className="flex items-center gap-2 rounded-xl px-3 py-2 text-cocoa-700 hover:bg-cream-200">
        <ExternalLink className="size-4" /> Ver la web
      </Link>
      <form action={logout}>
        <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-cocoa-700 hover:bg-cream-200">
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-cream-100">
      <AdminSidebar counts={counts} footer={footer} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 print:hidden items-center gap-3 border-b border-sand-300/70 bg-cream-100/90 px-4 backdrop-blur lg:hidden">
          <AdminMobileNav counts={counts} footer={footer} />
          <Link href="/admin" className="flex items-center gap-2">
            <BrandMark className="size-8" />
            <span className="font-display text-lg italic">{settings.business.name}</span>
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
    </div>
  );
}
