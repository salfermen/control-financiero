import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { ApiUnavailableError } from './server-session';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/** No existe o no es del usuario: la página debe mostrar «no encontrado». */
export class ApiNotFoundError extends Error {
  constructor() {
    super('No encontrado');
    this.name = 'ApiNotFoundError';
  }
}

/**
 * Lectura desde Server Components: reenvía la cookie de sesión a la API y
 * valida la respuesta con el esquema compartido. Sin sesión → al login. Si la
 * API falla o responde fuera de contrato, se lanza un error y la página
 * muestra su estado de error (nunca datos inventados ni a medias).
 */
export async function serverApi<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.output<T>> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) redirect('/ingresar');
  const forwardedFor = (await headers()).get('x-forwarded-for');

  let response: Response;
  try {
    response = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, {
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
  if (response.status === 401) redirect('/ingresar');
  if (response.status === 404) throw new ApiNotFoundError();
  if (!response.ok) throw new ApiUnavailableError();
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new ApiUnavailableError();
  return parsed.data;
}
