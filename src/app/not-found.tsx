import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/icons";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false, follow: true } };

/** 404 de las direcciones que no existen (fuera de las secciones con cabecera de la tienda). */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream-100 p-6 text-center">
      <Link href="/" aria-label="Repostería Madre Mía, ir al inicio">
        <BrandMark className="size-20" />
      </Link>
      <p className="font-display text-7xl text-blush-300">404</p>
      <h1 className="font-display text-3xl text-cocoa-900 sm:text-4xl">Esta página se ha comido</h1>
      <p className="max-w-md text-cocoa-600">No encontramos lo que buscas. Quizá te apetezca echar un vistazo a nuestras tartas.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/productos" className="btn-primary">
          Ver productos
        </Link>
        <Link href="/" className="btn-outline">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
