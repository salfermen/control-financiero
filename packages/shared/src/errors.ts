import { z } from 'zod';

/**
 * Códigos de error estables de la API.
 *
 * El cliente decide qué mostrar a partir de `code`; `message` es un texto ya
 * listo para el usuario (nunca un stack ni un "Error 500"). Los códigos no se
 * renombran: las apps móviles antiguas dependen de ellos.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'FORBIDDEN',
  'CSRF_REJECTED',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'BASE_CURRENCY_LOCKED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type SupportedLanguage = 'es' | 'en';

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  BASE_CURRENCY_LOCKED: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export const ERROR_MESSAGES: Record<ErrorCode, Record<SupportedLanguage, string>> = {
  VALIDATION_ERROR: {
    es: 'Algunos datos no son válidos. Revisa los campos marcados.',
    en: 'Some fields are not valid. Please review them.',
  },
  UNAUTHENTICATED: {
    es: 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
    en: 'Your session is invalid or has expired. Please sign in again.',
  },
  INVALID_CREDENTIALS: {
    es: 'Correo o contraseña incorrectos.',
    en: 'Incorrect email or password.',
  },
  ACCOUNT_LOCKED: {
    es: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
    en: 'Too many failed attempts. Wait a few minutes and try again.',
  },
  FORBIDDEN: {
    es: 'No tienes permiso para realizar esta acción.',
    en: 'You do not have permission to perform this action.',
  },
  CSRF_REJECTED: {
    es: 'La solicitud no pasó la verificación de seguridad. Recarga la página e intenta de nuevo.',
    en: 'The request failed a security check. Reload the page and try again.',
  },
  NOT_FOUND: {
    es: 'No encontramos lo que buscas.',
    en: 'We could not find what you are looking for.',
  },
  CONFLICT: {
    es: 'Ya existe un registro con esos datos.',
    en: 'A record with that data already exists.',
  },
  EMAIL_TAKEN: {
    es: 'Ya existe una cuenta con ese correo.',
    en: 'An account with that email already exists.',
  },
  BASE_CURRENCY_LOCKED: {
    es: 'No puedes cambiar la moneda base porque ya tienes movimientos registrados.',
    en: 'You cannot change the base currency because you already have transactions.',
  },
  PAYLOAD_TOO_LARGE: {
    es: 'La información enviada es demasiado grande.',
    en: 'The submitted data is too large.',
  },
  RATE_LIMITED: {
    es: 'Hiciste demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.',
    en: 'Too many requests. Please wait a moment and try again.',
  },
  SERVICE_UNAVAILABLE: {
    es: 'El servicio no está disponible temporalmente. Intenta de nuevo en unos minutos.',
    en: 'The service is temporarily unavailable. Please try again in a few minutes.',
  },
  INTERNAL_ERROR: {
    es: 'Ocurrió un error inesperado. Ya quedó registrado; intenta de nuevo.',
    en: 'An unexpected error occurred. It has been logged; please try again.',
  },
};

export interface FieldIssue {
  /** Ruta del campo, p. ej. `password` o `items.0.amount`. */
  readonly path: string;
  readonly message: string;
}

/** Forma única de todas las respuestas de error de la API. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly issues?: readonly FieldIssue[];
  };
}

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1),
    requestId: z.string().min(1),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export function errorMessage(code: ErrorCode, language: SupportedLanguage = 'es'): string {
  return ERROR_MESSAGES[code][language];
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
