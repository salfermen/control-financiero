import { assertLocalDate, compareLocalDates, type LocalDate } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import {
  DEFAULT_ROUNDING,
  Decimal,
  type RoundingMode,
  divideToScale,
  parseDecimal,
  roundToScale,
} from '../money/decimal.js';
import { Money, STORAGE_SCALE, assertSupportedCurrency } from '../money/money.js';

/** Decimales con los que se guarda una tasa (NUMERIC(24,10)). */
export const RATE_SCALE = 10;
const MAX_RATE = new Decimal('99999999999999.9999999999');
const MAX_SOURCE_LENGTH = 60;

/**
 * Tasa de cambio con su procedencia. `rate` = unidades de `quoteCurrency` por
 * 1 unidad de `baseCurrency` (base USD, quote COP, rate 4050 → 1 USD = 4.050 COP).
 *
 * El motor nunca obtiene ni inventa tasas: las recibe de quien las consultó
 * (proveedor externo, extracto o el propio usuario) y conserva la fuente.
 */
export interface ExchangeRate {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  /** Texto decimal con 10 decimales, como lo devuelve la base. */
  readonly rate: string;
  readonly rateDate: LocalDate;
  /** Último día en que rige (p. ej. TRM de fin de semana); `null` = solo `rateDate`. */
  readonly validUntil: LocalDate | null;
  /** Proveedor o tipo de fuente (`banrep-trm`, `manual`, `statement`…). */
  readonly source: string;
  /** Id de la fila en `exchange_rates`, si la tasa viene de ahí. */
  readonly id: string | null;
}

export interface ExchangeRateInput {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly rate: string;
  readonly rateDate: string;
  readonly validUntil?: string | null;
  readonly source: string;
  readonly id?: string | null;
}

/** Valida y normaliza una tasa. Rechaza tasas no positivas, con más de 10 decimales o fuera de rango. */
export function createExchangeRate(input: ExchangeRateInput): ExchangeRate {
  assertSupportedCurrency(input.baseCurrency);
  assertSupportedCurrency(input.quoteCurrency);
  if (input.baseCurrency === input.quoteCurrency) {
    throw new DomainError('INVALID_RATE', 'Una tasa necesita dos monedas distintas.', {
      currency: input.baseCurrency,
    });
  }
  const rate = parseRate(input.rate);
  const source = typeof input.source === 'string' ? input.source.trim() : '';
  if (source.length === 0 || source.length > MAX_SOURCE_LENGTH) {
    throw new DomainError('INVALID_RATE', 'Toda tasa debe indicar su fuente (máx. 60 caracteres).');
  }
  const rateDate = assertLocalDate(input.rateDate, 'fecha de la tasa');
  const validUntil = input.validUntil ?? null;
  if (validUntil !== null) {
    assertLocalDate(validUntil, 'vigencia de la tasa');
    if (compareLocalDates(validUntil, rateDate) < 0) {
      throw new DomainError('INVALID_RATE', 'La vigencia termina antes de la fecha de la tasa.');
    }
  }
  return Object.freeze({
    baseCurrency: input.baseCurrency,
    quoteCurrency: input.quoteCurrency,
    rate: rate.toFixed(RATE_SCALE),
    rateDate,
    validUntil,
    source,
    id: input.id ?? null,
  });
}

/** Resultado de una conversión: conserva el original, la tasa aplicada y su procedencia. */
export interface Conversion {
  readonly from: Money;
  readonly to: Money;
  /** Unidades de `to.currency` por 1 unidad de `from.currency`, con 10 decimales. */
  readonly appliedRate: string;
  /** `true` si `appliedRate` se obtuvo invirtiendo la tasa publicada (y por tanto se redondeó). */
  readonly inverted: boolean;
  readonly rate: ExchangeRate;
}

/**
 * Convierte un monto con una tasa explícita, en cualquiera de los dos sentidos
 * del par. El resultado se redondea a 4 decimales (por defecto half_up).
 *
 * En sentido inverso (COP → USD con una tasa USD/COP) el monto se calcula por
 * división exacta, no con la tasa invertida y redondeada.
 */
export function convert(
  money: Money,
  rate: ExchangeRate,
  mode: RoundingMode = DEFAULT_ROUNDING,
): Conversion {
  const value = new Decimal(rate.rate);
  if (money.currency === rate.baseCurrency) {
    return Object.freeze({
      from: money,
      to: Money.fromDecimal(money.toDecimal().times(value), rate.quoteCurrency, mode),
      appliedRate: rate.rate,
      inverted: false,
      rate,
    });
  }
  if (money.currency === rate.quoteCurrency) {
    const converted = divideToScale(money.toDecimal(), value, STORAGE_SCALE, mode);
    return Object.freeze({
      from: money,
      to: Money.fromDecimal(converted, rate.baseCurrency, mode),
      appliedRate: invertRate(value),
      inverted: true,
      rate,
    });
  }
  throw new DomainError('RATE_PAIR_MISMATCH', 'La tasa no corresponde a la moneda del monto.', {
    currency: money.currency,
    pair: `${rate.baseCurrency}/${rate.quoteCurrency}`,
  });
}

/**
 * Tasa implícita entre dos montos equivalentes (`to / from`, 10 decimales).
 * Se usa cuando el extracto trae el valor real cobrado en la moneda de la
 * cuenta: ese valor manda y la tasa se deduce de él.
 */
export function impliedRate(from: Money, to: Money): string {
  if (!from.isPositive() || !to.isPositive()) {
    throw new DomainError('INVALID_RATE', 'La tasa implícita necesita dos montos positivos.');
  }
  if (from.currency === to.currency) {
    throw new DomainError('INVALID_RATE', 'La tasa implícita necesita dos monedas distintas.', {
      currency: from.currency,
    });
  }
  const rate = divideToScale(to.toDecimal(), from.toDecimal(), RATE_SCALE, 'half_up');
  return assertRateInRange(rate).toFixed(RATE_SCALE);
}

function invertRate(rate: Decimal): string {
  return assertRateInRange(divideToScale(new Decimal(1), rate, RATE_SCALE, 'half_up')).toFixed(
    RATE_SCALE,
  );
}

function parseRate(input: string): Decimal {
  const rate = parseDecimal(input, 'INVALID_RATE', 'tasa');
  if (rate.decimalPlaces() > RATE_SCALE) {
    throw new DomainError('INVALID_RATE', `La tasa tiene más de ${RATE_SCALE} decimales.`, {
      rate: input,
    });
  }
  if (!rate.isPositive() || rate.isZero()) {
    throw new DomainError('INVALID_RATE', 'La tasa debe ser mayor que cero.', { rate: input });
  }
  return assertRateInRange(rate);
}

/** Una tasa válida es > 0 tras redondear a 10 decimales y cabe en NUMERIC(24,10). */
function assertRateInRange(rate: Decimal): Decimal {
  const rounded = roundToScale(rate, RATE_SCALE, 'half_up');
  if (rounded.isZero() || rounded.greaterThan(MAX_RATE)) {
    throw new DomainError('RATE_OUT_OF_RANGE', 'La tasa está fuera del rango admitido.');
  }
  return rounded;
}
