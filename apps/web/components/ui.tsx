import type { ReactNode } from 'react';

/** Piezas accesibles de interfaz compartidas por todas las pantallas (tokens de globals.css). */

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

const inputClass =
  'rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none transition-colors focus:border-accent aria-[invalid=true]:border-danger disabled:opacity-60';

function describedBy(id: string, hasError: boolean, hasHint = false) {
  return (
    [hasError ? `${id}-error` : null, hasHint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined
  );
}

function FieldMessages({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string | undefined;
  hint?: ReactNode;
}) {
  return (
    <>
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
    </>
  );
}

export function SelectField({
  id,
  label,
  error,
  hint,
  children,
  ...select
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(error), Boolean(hint) && !error)}
        className={inputClass}
        {...select}
      >
        {children}
      </select>
      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  ...textarea
}: {
  id: string;
  label: string;
  error?: string | undefined;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(error))}
        className={inputClass}
        {...textarea}
      />
      <FieldMessages id={id} error={error} />
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast',
  secondary: 'border border-border bg-surface',
  danger: 'bg-danger text-white',
  ghost: 'text-accent underline-offset-2 hover:underline',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...button
}: { variant?: ButtonVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-60 ${buttonVariants[variant]} ${className}`}
      {...button}
    />
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${tone === 'warning' ? 'bg-warning-surface text-warning' : 'bg-surface-muted text-text-muted'}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: 'neutral' | 'warning' | 'accent';
  children: ReactNode;
  title?: string;
}) {
  const tones = {
    neutral: 'bg-surface-muted text-text-muted',
    warning: 'bg-warning-surface text-warning',
    accent: 'bg-accent-surface text-accent',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="text-sm text-text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Enlace con aspecto de botón (navegación, no acción). */
export const linkButtonClass = {
  primary:
    'inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast',
  secondary:
    'inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium',
} as const;

export function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
  hint?: ReactNode;
}) {
  const tones = { neutral: '', positive: 'text-positive', negative: 'text-danger' };
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</dd>
      {hint ? <dd className="text-xs text-text-muted">{hint}</dd> : null}
    </div>
  );
}
