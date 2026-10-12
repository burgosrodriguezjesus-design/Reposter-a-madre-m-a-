import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="font-display text-8xl text-blush-300">404</p>
      <h1 className="mt-4 font-display text-4xl text-cocoa-900">Esta página se ha comido</h1>
      <p className="mx-auto mt-3 max-w-md text-cocoa-600">No encontramos lo que buscas. Quizá te apetezca echar un vistazo a nuestras tartas.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/productos" className="btn-primary">
          Ver productos
        </Link>
        <Link href="/" className="btn-outline">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
