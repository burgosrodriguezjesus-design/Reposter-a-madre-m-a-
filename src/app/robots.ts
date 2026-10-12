import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
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
