import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: string;
  back?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back && (
          <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-cocoa-500 hover:text-cocoa-800">
            <ArrowLeft className="size-4" /> Volver
          </Link>
        )}
        <h1 className="font-display text-3xl text-cocoa-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-cocoa-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  className,
  actions,
  id,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={clsx("min-w-0 scroll-mt-20 rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-cocoa-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const inner = (
    <>
      <p className="text-xs font-semibold tracking-wide text-cocoa-500 uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl text-cocoa-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cocoa-500">{hint}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-sand-300/70 bg-white p-4 shadow-soft";
  return href ? (
    <Link href={href} className={clsx(cls, "transition hover:border-blush-300")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={clsx("badge whitespace-nowrap", className)}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-sand-400 p-8 text-center text-sm text-cocoa-500">{children}</p>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-cocoa-500">{hint}</span>}
    </label>
  );
}

export function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-sand-300/70 bg-cream-50 p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-blush-600" />
      <span>
        <span className="font-medium text-cocoa-900">{label}</span>
        {hint && <span className="block text-xs text-cocoa-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={clsx("chip shrink-0", active === t.href && "chip-active")}>
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className={clsx("rounded-full px-1.5 text-xs", active === t.href ? "bg-white/25" : "bg-blush-100 text-blush-800")}>{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
