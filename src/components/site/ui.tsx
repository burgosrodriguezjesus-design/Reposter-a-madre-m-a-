import Image, { type ImageProps } from "next/image";
import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import clsx from "clsx";
import { JsonLd } from "@/components/site/JsonLd";
import { breadcrumbSchema } from "@/lib/structured-data";

/** next/image que no intenta optimizar SVG (las ilustraciones demo ya son vectoriales). */
export function SmartImage(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} unoptimized={props.unoptimized ?? src.endsWith(".svg")} />;
}

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  const all = [{ name: "Inicio", path: "/" }, ...items];
  return (
    <>
      <nav aria-label="Ruta de navegación" className="text-sm text-cocoa-500">
        <ol className="flex flex-wrap items-center gap-1">
          {all.map((item, i) => (
            <li key={item.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 text-cocoa-400" aria-hidden />}
              {i === all.length - 1 ? (
                <span aria-current="page" className="text-cocoa-700">
                  {item.name}
                </span>
              ) : (
                <Link href={item.path} className="hover:text-blush-700">
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbSchema(all)} />
    </>
  );
}

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span role="img" className={clsx("inline-flex gap-0.5 text-gold-500", className)} aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="size-4" fill={i <= Math.round(rating) ? "currentColor" : "none"} strokeWidth={1.5} />
      ))}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  align = "center",
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  align?: "center" | "left";
  as?: "h1" | "h2";
}) {
  return (
    <div className={clsx("reveal max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <Tag className={Tag === "h1" ? "font-display text-4xl leading-tight text-cocoa-900 sm:text-5xl" : "section-title"}>
        {title}
      </Tag>
      <div className={clsx("divider-dot my-6", align === "left" && "mx-0")} aria-hidden />
      {text && <p className="text-[16px] leading-relaxed text-cocoa-600">{text}</p>}
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={clsx("badge bg-cocoa-800/85 text-[10px] tracking-wider text-cream-50 uppercase", className)} title="Contenido de demostración">
      Demo
    </span>
  );
}

/** Párrafos separados por línea en blanco (texto plano introducido por el administrador). */
export function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx("prose-content", className)}>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}
