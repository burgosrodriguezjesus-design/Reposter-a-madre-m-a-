import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";
import { getSettings } from "@/lib/settings";
import { BuilderEditor } from "./BuilderEditor";

export const metadata = { title: "Personalizador de tartas" };

export default async function BuilderSettingsPage() {
  const { builder } = await getSettings();
  return (
    <>
      <PageHeader
        title="Personalizador de tartas"
        description="Define las opciones y precios. El precio estimado que ve el cliente se calcula con estas tarifas."
        actions={
          <Link href="/personalizar-tarta" target="_blank" className="btn-outline btn-sm">
            <ExternalLink className="size-4" /> Ver en la web
          </Link>
        }
      />
      <BuilderEditor initial={builder} />
    </>
  );
}
