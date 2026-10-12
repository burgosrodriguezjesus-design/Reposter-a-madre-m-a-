import { Breadcrumbs } from "@/components/site/ui";

export function LegalPage({ title, path, updated, children }: { title: string; path: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ name: title, path }]} />
      <h1 className="mt-6 font-display text-4xl text-cocoa-900 sm:text-5xl">{title}</h1>
      {updated && <p className="mt-2 text-sm text-cocoa-500">Última actualización: {updated}</p>}
      <div className="prose-content mt-8">{children}</div>
      <p className="mt-12 rounded-2xl border border-dashed border-sand-400 p-4 text-xs text-cocoa-500">
        Texto orientativo basado en el RGPD, la LOPDGDD, la LSSI-CE y la normativa de consumo española. Revísalo con un profesional y
        completa los datos entre corchetes antes de publicar la web.
      </p>
    </div>
  );
}
