import { DomainError } from '../errors.js';
import {
  type LocalDate,
  assertLocalDate,
  compareLocalDates,
  daysInMonth,
  formatLocalDate,
  parseYearMonth,
} from './local-date.js';

/** Rango de fechas contables, inclusivo en ambos extremos. */
export interface DateRange {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

export function createDateRange(from: LocalDate, to: LocalDate): DateRange {
  assertLocalDate(from, 'desde');
  assertLocalDate(to, 'hasta');
  if (compareLocalDates(from, to) > 0) {
    throw new DomainError('INVALID_DATE_RANGE', 'La fecha inicial es posterior a la final.', {
      from,
      to,
    });
  }
  return Object.freeze({ from, to });
}

/** Mes calendario completo: `monthRange('2028-02')` → 2028-02-01 … 2028-02-29. */
export function monthRange(yearMonth: string): DateRange {
  const { year, month } = parseYearMonth(yearMonth);
  return createDateRange(
    formatLocalDate({ year, month, day: 1 }),
    formatLocalDate({ year, month, day: daysInMonth(year, month) }),
  );
}

export function isWithinRange(date: LocalDate, range: DateRange): boolean {
  return compareLocalDates(date, range.from) >= 0 && compareLocalDates(date, range.to) <= 0;
}
