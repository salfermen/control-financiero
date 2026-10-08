export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}
