'use client';

import { authResponseDtoSchema } from '@cf/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Card, Field, SubmitButton } from '@/components/ui';
import { ApiError, apiRequest } from '@/lib/api-client';

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password'),
          tokenTransport: 'cookie',
        },
        schema: authResponseDtoSchema,
      });
      router.replace('/inicio');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'UNKNOWN', 'Ocurrió un error inesperado.'),
      );
      setPending(false);
    }
  }

  return (
    <Card>
      <h1 className="mb-1 text-2xl font-semibold">Ingresar</h1>
      <p className="mb-6 text-sm text-text-muted">Accede a tu información financiera.</p>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {error && !error.issues.length ? <Alert>{error.message}</Alert> : null}
        <Field
          id="email"
          label="Correo"
          type="email"
          autoComplete="email"
          required
          error={error?.fieldError('email')}
        />
        <Field
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          error={error?.fieldError('password')}
        />
        <SubmitButton pending={pending}>Ingresar</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-text-muted">
        ¿No tienes cuenta?{' '}
        <Link
          href="/registro"
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Crea una
        </Link>
      </p>
    </Card>
  );
}
