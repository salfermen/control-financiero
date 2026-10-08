import { ApiError } from './api-client';

/** Normaliza cualquier fallo de un formulario a un `ApiError` mostrable. */
export function toApiError(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, 'UNKNOWN', 'Ocurrió un error inesperado. Intenta de nuevo.');
}

/** Mensaje general: solo si el error no está asociado a un campo visible. */
export function generalMessage(error: ApiError | null, fields: readonly string[]): string | null {
  if (!error) return null;
  const unassigned = error.issues.filter((issue) => !fields.includes(issue.path));
  if (error.issues.length > 0 && unassigned.length === 0) return null;
  return unassigned[0]?.message ?? error.message;
}

/** Valor de texto de un campo del formulario (vacío si no existe o es un archivo). */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
