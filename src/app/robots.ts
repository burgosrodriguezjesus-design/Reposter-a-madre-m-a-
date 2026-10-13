import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { isProductionEnv } from "@/lib/app-env";

export default function robots(): MetadataRoute.Robots {
  // Pruebas y staging: que ningún buscador los indexe
  if (!isProductionEnv()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/carrito", "/finalizar-pedido", "/pedido/", "/presupuesto/", "/baja", "/productos?"],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
