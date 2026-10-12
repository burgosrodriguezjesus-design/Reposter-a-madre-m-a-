import Link from "next/link";

/** 404 global (rutas fuera del sitio público, p. ej. /admin/...). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-7xl text-blush-300">404</p>
      <h1 className="font-display text-3xl text-cocoa-900">Página no encontrada</h1>
      <Link href="/" className="btn-primary">
        Ir al inicio
      </Link>
    </div>
  );
}
