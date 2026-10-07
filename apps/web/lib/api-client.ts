import { type FieldIssue, isApiErrorBody } from '@cf/shared';
import type { z } from 'zod';

export const CSRF_HEADER = 'x-csrf-protection';

/** Error de la API ya listo para mostrar (mensaje traducido por el servidor). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly FieldIssue[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensaje del primer problema asociado a un campo, si existe. */
  fieldError(path: string): string | undefined {
    return this.issues.find((issue) => issue.path === path)?.message;
  }
}

const NETWORK_MESSAGE =
  'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
const UNAVAILABLE_MESSAGE =
  'El servicio no está disponible temporalmente. Intenta de nuevo en unos minutos.';
const CONTRACT_MESSAGE =
  'Recibimos una respuesta inesperada del servidor. Intenta de nuevo; si persiste, avísanos.';

interface RequestOptions<T extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Esquema de la respuesta: los datos se validan antes de llegar a la UI. */
  schema?: T;
  fetchImpl?: typeof fetch;
}

/**
 * Cliente del navegador para la API (misma URL de origen, cookie httpOnly).
 * Valida la respuesta con el esquema compartido: si el servidor devuelve algo
 * distinto del contrato, se muestra un error en lugar de datos dudosos.
 */
export async function apiRequest<T extends z.ZodType = z.ZodVoid>(
  path: string,
  { method = 'GET', body, schema, fetchImpl = fetch }: RequestOptions<T> = {},
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { [CSRF_HEADER]: '1' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }

  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    if (isApiErrorBody(data)) {
      const { code, message, issues, requestId } = data.error;
      throw new ApiError(response.status, code, message, issues ?? [], requestId);
    }
    throw new ApiError(response.status, 'SERVICE_UNAVAILABLE', UNAVAILABLE_MESSAGE);
  }

  if (!schema) return undefined as z.output<T>;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(response.status, 'CONTRACT_MISMATCH', CONTRACT_MESSAGE);
  }
  return parsed.data;
}
