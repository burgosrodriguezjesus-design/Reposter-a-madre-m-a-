import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { business } = await getSettings();
  return {
    name: business.name,
    short_name: business.name.slice(0, 12),
    description: business.description,
    start_url: "/",
    display: "standalone",
    background_color: "#F6F0EB",
    theme_color: "#F6F0EB",
    lang: "es",
    icons: [
      { src: "/brand/logo-512.webp", type: "image/webp", sizes: "512x512" },
      { src: "/icon.png", type: "image/png", sizes: "96x96" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
