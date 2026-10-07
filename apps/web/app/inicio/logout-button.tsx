'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api-client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setError(null);
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      router.replace('/ingresar');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos cerrar la sesión.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void logout()}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
