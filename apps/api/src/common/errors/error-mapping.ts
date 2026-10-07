import { HttpException } from '@nestjs/common';
import type { ErrorCode, FieldIssue, SupportedLanguage } from '@cf/shared';
import { AppError } from './app-error.js';

export interface MappedError {
  code: ErrorCode;
  status: number;
  issues?: readonly FieldIssue[];
  /** `true` si es un fallo del servidor que debe registrarse como error. */
  unexpected: boolean;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'VALIDATION_ERROR',
  423: 'ACCOUNT_LOCKED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

function codeForStatus(status: number): ErrorCode {
  return STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pgCode(error: Record<string, unknown>): string | undefined {
  const candidate = isObject(error.cause) ? error.cause : error;
  const code = candidate.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

const INTERNAL: MappedError = { code: 'INTERNAL_ERROR', status: 500, unexpected: true };

/**
 * Traduce cualquier excepción a un error de contrato. Lo desconocido se trata
 * como error interno: el cliente recibe un mensaje genérico y el detalle queda
 * solo en los logs.
 */
export function mapError(error: unknown): MappedError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      status: error.status,
      ...(error.issues ? { issues: error.issues } : {}),
      unexpected: false,
    };
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    return { code: codeForStatus(status), status, unexpected: status >= 500 };
  }

  // Cualquier cosa lanzada que no sea un objeto (`throw null`, un string…).
  if (!isObject(error)) return { ...INTERNAL };

  // Errores de Fastify (JSON mal formado, cuerpo demasiado grande, etc.).
  const fastifyStatus = error.statusCode;
  const fastifyCode = error.code;
  if (
    typeof fastifyStatus === 'number' &&
    typeof fastifyCode === 'string' &&
    fastifyCode.startsWith('FST_')
  ) {
    return {
      code: codeForStatus(fastifyStatus),
      status: fastifyStatus,
      unexpected: fastifyStatus >= 500,
    };
  }

  // Violaciones de integridad de PostgreSQL que escaparon a la validación.
  const sqlState = pgCode(error);
  if (sqlState === '23505') {
    return { code: 'CONFLICT', status: 409, unexpected: false };
  }
  if (sqlState === '57P01' || sqlState === '08006' || sqlState === '08001') {
    return { code: 'SERVICE_UNAVAILABLE', status: 503, unexpected: true };
  }

  return { ...INTERNAL };
}

/** Idioma de la respuesta a partir de Accept-Language (español por defecto). */
export function languageFrom(acceptLanguage: string | string[] | undefined): SupportedLanguage {
  const header = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
  return header?.trim().toLowerCase().startsWith('en') ? 'en' : 'es';
}
