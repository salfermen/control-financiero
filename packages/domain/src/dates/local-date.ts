import { DomainError } from '../errors.js';

/**
 * Fechas contables sin hora (`YYYY-MM-DD`).
 *
 * Un movimiento del 31 de octubre es del 31 de octubre en cualquier zona
 * horaria: por eso las fechas contables son texto y nunca pasan por
 * `new Date('2026-10-31')` (que las interpreta como medianoche UTC y en
 * Colombia las convierte en el 30). La aritmética interna usa UTC puro, donde
 * no hay horario de verano ni corrimientos.
 *
 * Los instantes (creación, sincronización) son `Date`/timestamptz; para saber
 * a qué fecha local corresponde un instante usa `localDateInTimeZone`.
 */
export type LocalDate = string;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DomainError('INVALID_DATE', 'Mes inválido.', { month });
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Valida formato y calendario real (rechaza 2026-02-29 y 2026-04-31). */
export function parseLocalDate(value: string, field = 'fecha'): LocalDateParts {
  const match = typeof value === 'string' ? LOCAL_DATE_PATTERN.exec(value) : null;
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
  }
  throw new DomainError('INVALID_DATE', `${field} no es una fecha válida (AAAA-MM-DD).`, {
    field,
    received: typeof value === 'string' ? value.slice(0, 32) : typeof value,
  });
}

export function isValidLocalDate(value: string): boolean {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

export function assertLocalDate(value: string, field = 'fecha'): LocalDate {
  parseLocalDate(value, field);
  return value;
}

export function formatLocalDate(parts: LocalDateParts): LocalDate {
  const value = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return assertLocalDate(value);
}

/** -1 si `a` es anterior, 0 si son iguales, 1 si es posterior. */
export function compareLocalDates(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  assertLocalDate(a);
  assertLocalDate(b);
  // Con años de 4 dígitos el orden lexicográfico coincide con el cronológico.
  return a === b ? 0 : a < b ? -1 : 1;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  assertInteger(days, 'días');
  return fromEpochDay(toEpochDay(date) + days);
}

/**
 * Suma meses conservando el día cuando existe y, si no, usando el último día
 * del mes destino: 31-ene + 1 mes = 28-feb (o 29 en bisiesto).
 */
export function addMonths(date: LocalDate, months: number): LocalDate {
  assertInteger(months, 'meses');
  const { year, month, day } = parseLocalDate(date);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  assertYearInRange(targetYear);
  return formatLocalDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return formatLocalDate({ year, month, day: 1 });
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return formatLocalDate({ year, month, day: daysInMonth(year, month) });
}

/** Mes contable `YYYY-MM` de una fecha. */
export function yearMonthOf(date: LocalDate): string {
  assertLocalDate(date);
  return date.slice(0, 7);
}

export function parseYearMonth(value: string): { readonly year: number; readonly month: number } {
  const match = typeof value === 'string' ? YEAR_MONTH_PATTERN.exec(value) : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || year < 1 || month < 1 || month > 12) {
    throw new DomainError('INVALID_DATE', 'El mes no es válido (AAAA-MM).', {
      received: typeof value === 'string' ? value.slice(0, 16) : typeof value,
    });
  }
  return { year, month };
}

/**
 * Fecha local (calendario gregoriano) de un instante en una zona IANA.
 * Ej.: 2026-11-01T03:00:00Z en America/Bogota es 2026-10-31.
 */
export function localDateInTimeZone(instant: Date, timeZone: string): LocalDate {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new DomainError('INVALID_DATE', 'El instante no es una fecha válida.');
  }
  const parts = getDateFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return formatLocalDate({ year: read('year'), month: read('month'), day: read('day') });
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        calendar: 'gregory',
        numberingSystem: 'latn',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      throw new DomainError('INVALID_TIME_ZONE', 'Zona horaria no válida.', {
        timeZone: typeof timeZone === 'string' ? timeZone.slice(0, 64) : typeof timeZone,
      });
    }
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

const MS_PER_DAY = 86_400_000;

/** Días desde 1970-01-01 (UTC puro, sin zona horaria). */
function toEpochDay(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  const utc = new Date(0);
  // setUTCFullYear evita que los años 0–99 se interpreten como 1900–1999.
  utc.setUTCFullYear(year, month - 1, day);
  return Math.round(utc.getTime() / MS_PER_DAY);
}

function fromEpochDay(epochDay: number): LocalDate {
  const utc = new Date(epochDay * MS_PER_DAY);
  const year = utc.getUTCFullYear();
  assertYearInRange(year);
  return formatLocalDate({ year, month: utc.getUTCMonth() + 1, day: utc.getUTCDate() });
}

function assertYearInRange(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new DomainError('INVALID_DATE', 'La fecha resultante está fuera del rango 0001–9999.', {
      year,
    });
  }
}

function assertInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('INVALID_DATE', `${field} debe ser un número entero.`, { field });
  }
}
