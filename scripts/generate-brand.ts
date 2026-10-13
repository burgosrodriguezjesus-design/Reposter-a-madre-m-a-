/**
 * Genera las versiones del logotipo a partir de public/brand/logo-original.jpg (1508×1508):
 *   public/brand/logo-512.webp, logo-256.webp  círculo con fondo transparente (web)
 *   public/brand/logo-email.png                 160 px, PNG (los clientes de correo no siempre admiten WebP)
 *   public/brand/og.jpg                         1200×630 para compartir en redes (WhatsApp, Facebook…)
 *   src/app/icon.png (favicon) y src/app/apple-icon.png
 * Uso: npx tsx scripts/generate-brand.ts   (vuelve a ejecutarlo si cambias el logotipo)
 */
import { unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("public/brand/logo-original.jpg");
const OUT = path.resolve("public/brand");
const CREAM = { r: 249, g: 244, b: 240, alpha: 1 }; // fondo del logotipo (#F9F4F0)

/** Recorta el círculo del logotipo (las esquinas del JPG son blancas) con fondo transparente. */
async function round(size: number): Promise<Buffer> {
  const r = size / 2;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r - 0.5}" fill="#fff"/></svg>`);
  return sharp(SRC).resize(size, size).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function main() {
  await sharp(await round(512)).webp({ quality: 90 }).toFile(path.join(OUT, "logo-512.webp"));
  await sharp(await round(256)).webp({ quality: 90 }).toFile(path.join(OUT, "logo-256.webp"));
  await sharp(await round(160)).png({ compressionLevel: 9 }).toFile(path.join(OUT, "logo-email.png"));

  // Favicon: el círculo completo; a 32 px solo se distingue la silueta, por eso se genera a 96 px
  await sharp(await round(96)).png({ compressionLevel: 9 }).toFile(path.resolve("src/app/icon.png"));
  // Apple: iOS recorta con esquinas redondeadas; mejor fondo crema a sangre y el logotipo con margen
  await sharp({ create: { width: 180, height: 180, channels: 4, background: CREAM } })
    .composite([{ input: await round(164), top: 8, left: 8 }])
    .png()
    .toFile(path.resolve("src/app/apple-icon.png"));

  // Imagen para compartir: logotipo centrado sobre crema
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: CREAM } })
    .composite([{ input: await round(540), top: 45, left: 330 }])
    .flatten({ background: CREAM })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(OUT, "og.jpg"));

  // El icono SVG anterior tendría prioridad sobre icon.png en algunos navegadores
  const oldIcon = path.resolve("src/app/icon.svg");
  if (existsSync(oldIcon)) unlinkSync(oldIcon);
  console.log("✓ Logotipo generado en public/brand y src/app/{icon,apple-icon}.png");
}

main();
