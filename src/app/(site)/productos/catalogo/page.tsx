import { CatalogView, catalogMetadata } from "../catalog-view";

/**
 * /productos sin filtros, generado de forma estática (se renueva cada 5 minutos o al guardar en
 * el panel). Se llega por la reescritura de next.config.ts: la dirección pública sigue siendo /productos.
 */
export const revalidate = 300;
export const generateMetadata = catalogMetadata;

export default function CatalogStaticPage() {
  return <CatalogView params={{}} />;
}
