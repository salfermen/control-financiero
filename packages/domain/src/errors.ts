/**
 * Errores del dominio financiero.
 *
 * El motor nunca devuelve un resultado dudoso: si una entrada no cumple las
 * reglas, lanza un `DomainError` con un código estable. La API traduce cada
 * código a una respuesta HTTP y a un mensaje para el usuario; el `message` de
 * aquí es técnico (para logs y desarrolladores) y nunca incluye secretos.
 */
export const DOMAIN_ERROR_CODES = [
  /** El texto no es un número decimal válido (se exige formato `-123.45`). */
  'INVALID_NUMBER',
  /** El monto tiene más decimales de los que se pueden guardar (4). */
  'TOO_MANY_DECIMALS',
  /** El monto supera el rango de NUMERIC(20,4). */
  'AMOUNT_OUT_OF_RANGE',
  /** El movimiento exige un monto estrictamente positivo. */
  'NON_POSITIVE_AMOUNT',
  /** La conversión produce 0 al redondear y el libro exige montos positivos. */
  'AMOUNT_ROUNDS_TO_ZERO',
  'UNSUPPORTED_CURRENCY',
  /** Se intentó operar dinero de monedas distintas sin conversión explícita. */
  'CURRENCY_MISMATCH',
  'DIVISION_BY_ZERO',
  /** Pesos de reparto inválidos (vacíos, negativos o todos en cero). */
  'INVALID_ALLOCATION',
  /** Tasa de cambio con formato, signo o par de monedas inválido. */
  'INVALID_RATE',
  /** La tasa no cabe en NUMERIC(24,10) o redondea a 0. */
  'RATE_OUT_OF_RANGE',
  /** La tasa no corresponde a las monedas que se quieren convertir. */
  'RATE_PAIR_MISMATCH',
  /** Hace falta una tasa (o el monto liquidado) para convertir. */
  'MISSING_EXCHANGE_RATE',
  /** Se entregó una conversión que no hace falta (posible error del llamador). */
  'UNEXPECTED_CONVERSION',
  'INVALID_DATE',
  'INVALID_DATE_RANGE',
  'INVALID_TIME_ZONE',
  /** El movimiento no cumple las reglas del libro (ver `details.rule`). */
  'INVALID_LEDGER_ENTRY',
  'INVALID_ACCOUNT',
  /** Un movimiento no pertenece a la cuenta que se está calculando. */
  'ACCOUNT_MISMATCH',
  /** Se pidió un saldo anterior a la fecha del saldo inicial. */
  'DATE_BEFORE_OPENING_BALANCE',
  'INVALID_TRANSFER',
  'INVALID_REFUND',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details: DomainErrorDetails = {},
  ) {
    super(message);
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
