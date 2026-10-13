import type { Metadata } from "next";
import { CatalogView, catalogMetadata, type CatalogParams } from "./catalog-view";

// Solo con filtros (?categoria=…, ?q=…): sin ellos, next.config.ts sirve la versión estática
// de ./catalogo, que no ocupa al servidor en cada visita.
export async function generateMetadata({ searchParams }: { searchParams: Promise<CatalogParams> }): Promise<Metadata> {
  const params = await searchParams;
  const filtered = Object.values(params).some(Boolean);
  return { ...(await catalogMetadata()), robots: filtered ? { index: false, follow: true } : undefined };
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<CatalogParams> }) {
  return <CatalogView params={await searchParams} />;
}
