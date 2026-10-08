import {
  compareLocalDates,
  daysBetween,
  assertLocalDate,
  type LocalDate,
} from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { Decimal, divideToScale } from '../money/decimal.js';
import { type ExchangeRate, RATE_SCALE } from './exchange-rate.js';

/**
 * Resultado de buscar la tasa que rige en una fecha:
 * - `current`: hay una tasa vigente ese día.
 * - `stale`: la más reciente anterior ya no rige; `daysOutdated` dice cuántos
 *   días pasaron desde el fin de su vigencia (§12: detectar datos antiguos).
 * - `missing`: no hay ninguna tasa anterior o igual a la fecha.
 */
export type RateResolution =
  | { readonly status: 'current'; readonly rate: ExchangeRate }
  | { readonly status: 'stale'; readonly rate: ExchangeRate; readonly daysOutdated: number }
  | { readonly status: 'missing' };

/**
 * Elige, entre tasas de un mismo par, la que rige en `date`: la de fecha más
 * reciente que no sea posterior a `date`. Nunca usa una tasa futura ni inventa
 * una; si no hay datos responde `missing`.
 */
export function resolveRateForDate(
  candidates: readonly ExchangeRate[],
  date: LocalDate,
): RateResolution {
  assertLocalDate(date, 'fecha');
  const [first] = candidates;
  let best: ExchangeRate | undefined;
  for (const candidate of candidates) {
    if (
      candidate.baseCurrency !== first?.baseCurrency ||
      candidate.quoteCurrency !== first.quoteCurrency
    ) {
      throw new DomainError('RATE_PAIR_MISMATCH', 'Las tasas candidatas son de pares distintos.');
    }
    if (compareLocalDates(candidate.rateDate, date) > 0) continue;
    if (!best || compareLocalDates(candidate.rateDate, best.rateDate) > 0) best = candidate;
  }
  if (!best) return { status: 'missing' };
  const lastValidDay = best.validUntil ?? best.rateDate;
  const daysOutdated = daysBetween(lastValidDay, date);
  return daysOutdated <= 0
    ? { status: 'current', rate: best }
    : { status: 'stale', rate: best, daysOutdated };
}

export interface RateVariation {
  /** `actual − anterior`, en unidades de la moneda cotizada (10 decimales). */
  readonly absolute: string;
  /** `(actual − anterior) / anterior` con 4 decimales: «0.0125» = +1,25 %. */
  readonly relative: string;
}

/** Variación entre dos tasas del mismo par (exacta; solo redondea la relativa). */
export function rateVariation(current: ExchangeRate, previous: ExchangeRate): RateVariation {
  if (
    current.baseCurrency !== previous.baseCurrency ||
    current.quoteCurrency !== previous.quoteCurrency
  ) {
    throw new DomainError('RATE_PAIR_MISMATCH', 'Solo se comparan tasas del mismo par.');
  }
  const now = new Decimal(current.rate);
  const before = new Decimal(previous.rate);
  const absolute = now.minus(before);
  return {
    absolute: absolute.toFixed(RATE_SCALE),
    relative: divideToScale(absolute, before, 4, 'half_up').toFixed(4),
  };
}
