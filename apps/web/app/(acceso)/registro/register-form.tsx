'use client';

import { PASSWORD_MIN_LENGTH, sessionInfoDtoSchema } from '@cf/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Card, Field, SubmitButton } from '@/components/ui';
import { ApiError, apiRequest } from '@/lib/api-client';

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          displayName: form.get('displayName'),
          email: form.get('email'),
          password: form.get('password'),
          acceptTerms: form.get('acceptTerms') === 'on',
        },
        schema: sessionInfoDtoSchema,
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

  const termsError = error?.fieldError('acceptTerms');

  return (
    <Card>
      <h1 className="mb-1 text-2xl font-semibold">Crear cuenta</h1>
      <p className="mb-6 text-sm text-text-muted">
        Empieza en menos de un minuto. Podrás completar el resto después.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {error && !error.issues.length ? <Alert>{error.message}</Alert> : null}
        <Field
          id="displayName"
          label="Nombre"
          autoComplete="name"
          required
          error={error?.fieldError('displayName')}
        />
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
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Una frase larga es más segura que símbolos raros.`}
          error={error?.fieldError('password')}
        />
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="acceptTerms"
              className="mt-1"
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? 'acceptTerms-error' : undefined}
            />
            <span>Acepto los términos de uso y la política de privacidad.</span>
          </label>
          {termsError ? (
            <p id="acceptTerms-error" className="text-xs text-danger">
              {termsError}
            </p>
          ) : null}
        </div>
        <SubmitButton pending={pending}>Crear cuenta</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-text-muted">
        ¿Ya tienes cuenta?{' '}
        <Link
          href="/ingresar"
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Ingresa
        </Link>
      </p>
    </Card>
  );
}
