import type { ReactNode } from 'react';

/** Piezas mínimas y accesibles de interfaz. El sistema de diseño completo llega con la UI financiera. */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-6 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  ...input
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none transition-colors focus:border-accent aria-[invalid=true]:border-danger"
        {...input}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-contrast transition-opacity disabled:opacity-60"
    >
      {pending ? 'Procesando…' : children}
    </button>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
      {children}
    </div>
  );
}
