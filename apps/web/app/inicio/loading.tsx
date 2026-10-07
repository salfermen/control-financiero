export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8"
      aria-busy="true"
      aria-label="Cargando"
    >
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-surface-muted" />
    </main>
  );
}
