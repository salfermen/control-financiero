'use client';

/** Estado de error global: mensaje útil y opción de reintentar, nunca un "Error 500". */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">No pudimos cargar esta página</h1>
      <p className="text-text-muted">
        El servicio no respondió. Tu información no se ha modificado. Intenta de nuevo en unos
        segundos.
      </p>
      <button
        type="button"
        onClick={reset}
        className="self-start rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-contrast"
      >
        Reintentar
      </button>
    </main>
  );
}
