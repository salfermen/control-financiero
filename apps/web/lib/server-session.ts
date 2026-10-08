import { type SessionInfoDto, sessionInfoDtoSchema } from '@cf/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

export class ApiUnavailableError extends Error {
  constructor() {
    super('API no disponible');
    this.name = 'ApiUnavailableError';
  }
}

/**
 * Lee la sesión actual desde un Server Component reenviando la cookie a la API.
 * Devuelve `null` si no hay sesión válida; lanza si la API no responde (la UI
 * muestra entonces un estado de error, nunca datos inventados). `cache` evita
 * repetir la consulta en una misma petición (layout + página).
 */
export const getSession = cache(async function getSession(): Promise<SessionInfoDto | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;
  // Reenvía la IP del cliente para que la API (con TRUST_PROXY) no vea a todos
  // los usuarios como la IP del servidor web.
  const forwardedFor = (await headers()).get('x-forwarded-for');

  let response: Response;
  try {
    response = await fetch(`${API_INTERNAL_URL}/api/v1/auth/session`, {
      headers: {
        cookie: cookieHeader,
        accept: 'application/json',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiUnavailableError();
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiUnavailableError();
  return sessionInfoDtoSchema.parse(await response.json());
});
