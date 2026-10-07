import type { ReactNode } from 'react';

export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-accent">Control Financiero</p>
        <p className="text-sm text-text-muted">Tu centro de control financiero personal.</p>
      </header>
      {children}
    </main>
  );
}
