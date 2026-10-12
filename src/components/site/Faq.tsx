import { ChevronDown } from "lucide-react";
import { JsonLd } from "@/components/site/JsonLd";
import { faqSchema } from "@/lib/structured-data";

export function Faq({ items, title = "Preguntas frecuentes" }: { items: { q: string; a: string }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-16">
      <h2 className="section-title">{title}</h2>
      <div className="mt-6 divide-y divide-sand-300/70 rounded-3xl border border-sand-300/60 bg-white px-5 shadow-soft sm:px-7">
        {items.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-cocoa-900">
              <h3 className="text-[16px]">{item.q}</h3>
              <ChevronDown className="size-5 shrink-0 text-gold-600 transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 leading-relaxed text-cocoa-700">{item.a}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqSchema(items)} />
    </section>
  );
}
