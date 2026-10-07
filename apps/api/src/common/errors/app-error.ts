import { ERROR_HTTP_STATUS, type ErrorCode, type FieldIssue } from '@cf/shared';

/**
 * Error de negocio con código estable. Se lanza desde servicios y guards; el
 * filtro global lo convierte en la respuesta estándar `{ error: {...} }`.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly issues?: readonly FieldIssue[],
    /** Detalle técnico solo para logs; nunca se envía al cliente. */
    readonly internalDetail?: string,
  ) {
    super(code);
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
  }
}
