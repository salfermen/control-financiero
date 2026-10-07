import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-text-muted">La dirección no existe o fue movida.</p>
      <Link href="/" className="font-medium text-accent underline-offset-2 hover:underline">
        Volver al inicio
      </Link>
    </main>
  );
}
