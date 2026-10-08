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
  'ACCOUNT_CLOSED',
  'ACCOUNT_HAS_TRANSACTIONS',
  'TRANSACTION_HAS_REFUNDS',
  'TRANSACTION_NOT_EDITABLE',
  'TRANSACTION_BEFORE_OPENING_BALANCE',
  'EXCHANGE_RATE_UNAVAILABLE',
  'RULE_VIOLATION',
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
  ACCOUNT_CLOSED: 409,
  ACCOUNT_HAS_TRANSACTIONS: 409,
  TRANSACTION_HAS_REFUNDS: 409,
  TRANSACTION_NOT_EDITABLE: 409,
  TRANSACTION_BEFORE_OPENING_BALANCE: 422,
  EXCHANGE_RATE_UNAVAILABLE: 422,
  RULE_VIOLATION: 422,
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
  ACCOUNT_CLOSED: {
    es: 'Esa cuenta está cerrada. Reábrela para registrar movimientos.',
    en: 'That account is closed. Reopen it to record transactions.',
  },
  ACCOUNT_HAS_TRANSACTIONS: {
    es: 'La cuenta tiene movimientos y no se puede eliminar. Puedes cerrarla para conservar su historial.',
    en: 'The account has transactions and cannot be deleted. You can close it to keep its history.',
  },
  TRANSACTION_HAS_REFUNDS: {
    es: 'Este gasto tiene reembolsos registrados. Elimina primero los reembolsos.',
    en: 'This expense has refunds. Delete the refunds first.',
  },
  TRANSACTION_NOT_EDITABLE: {
    es: 'Ese cambio no se puede hacer sobre este movimiento. Elimínalo y regístralo de nuevo.',
    en: 'That change is not allowed on this transaction. Delete it and record it again.',
  },
  TRANSACTION_BEFORE_OPENING_BALANCE: {
    es: 'La fecha es anterior al saldo inicial de la cuenta: ese movimiento ya está incluido en él.',
    en: 'The date is before the account opening balance: that transaction is already included in it.',
  },
  EXCHANGE_RATE_UNAVAILABLE: {
    es: 'No tenemos la tasa de cambio oficial para esa fecha. Escribe el valor que te cobraron en la moneda de la cuenta o la tasa que aplicó tu banco.',
    en: 'We do not have the official exchange rate for that date. Enter the amount charged in the account currency or the rate your bank applied.',
  },
  RULE_VIOLATION: {
    es: 'La operación no cumple las reglas de los movimientos. Revisa los datos marcados.',
    en: 'The operation does not follow the transaction rules. Please review the marked fields.',
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
