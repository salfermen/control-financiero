import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { localDate } from '../test-support/arbitraries.js';
import { createDateRange, isWithinRange, monthRange } from './date-range.js';
import {
  addDays,
  addMonths,
  assertLocalDate,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  endOfMonth,
  formatLocalDate,
  isLeapYear,
  isValidLocalDate,
  localDateInTimeZone,
  parseLocalDate,
  parseYearMonth,
  startOfMonth,
  yearMonthOf,
} from './local-date.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

describe('fechas contables', () => {
  it('reconoce años bisiestos (regla gregoriana completa)', () => {
    expect([2024, 2028, 2000, 2400].map(isLeapYear)).toEqual([true, true, true, true]);
    expect([2026, 1900, 2100, 2200].map(isLeapYear)).toEqual([false, false, false, false]);
  });

  it('conoce los días de cada mes', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(code(() => daysInMonth(2026, 13))).toBe('INVALID_DATE');
  });

  it.each(['2026-10-07', '2028-02-29', '2000-02-29', '0001-01-01', '9999-12-31'])(
    'acepta %s',
    (value) => {
      expect(isValidLocalDate(value)).toBe(true);
      expect(assertLocalDate(value)).toBe(value);
    },
  );

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '0000-01-01',
    '2026-1-7',
    '07/10/2026',
    '2026-10-07T00:00:00Z',
    '',
  ])('rechaza %j', (value) => {
    expect(isValidLocalDate(value)).toBe(false);
    expect(code(() => parseLocalDate(value))).toBe('INVALID_DATE');
  });

  it('rechaza valores que no son texto', () => {
    expect(isValidLocalDate(new Date() as unknown as string)).toBe(false);
  });

  it('compara cronológicamente', () => {
    expect(compareLocalDates('2026-10-07', '2026-10-08')).toBe(-1);
    expect(compareLocalDates('2026-10-07', '2026-10-07')).toBe(0);
    expect(compareLocalDates('2027-01-01', '2026-12-31')).toBe(1);
    expect(code(() => compareLocalDates('2026-10-07', '2026-02-30'))).toBe('INVALID_DATE');
  });

  it('suma días cruzando meses, años y el 29 de febrero', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-07', 0)).toBe('2026-10-07');
    expect(addDays('0099-12-31', 1)).toBe('0100-01-01');
  });

  it('suma meses ajustando al último día cuando no existe', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-30', 3)).toBe('2027-01-30');
    expect(addMonths('2026-05-31', -17)).toBe('2024-12-31');
  });

  it('rechaza desplazamientos no enteros o fuera de rango', () => {
    expect(code(() => addDays('2026-10-07', 1.5))).toBe('INVALID_DATE');
    expect(code(() => addMonths('2026-10-07', Number.NaN))).toBe('INVALID_DATE');
    expect(code(() => addDays('9999-12-31', 1))).toBe('INVALID_DATE');
    expect(code(() => addDays('0001-01-01', -1))).toBe('INVALID_DATE');
    expect(code(() => addMonths('0001-01-15', -1))).toBe('INVALID_DATE');
    expect(code(() => addMonths('9999-12-15', 1))).toBe('INVALID_DATE');
    expect(code(() => addDays('2026-10-07', 10 ** 12))).toBe('INVALID_DATE');
  });

  it('cuenta días entre fechas', () => {
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetween('2028-01-01', '2028-12-31')).toBe(365);
    expect(daysBetween('2026-10-07', '2026-10-01')).toBe(-6);
  });

  it('calcula inicio y fin de mes', () => {
    expect(startOfMonth('2026-10-07')).toBe('2026-10-01');
    expect(endOfMonth('2026-10-07')).toBe('2026-10-31');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(yearMonthOf('2026-10-07')).toBe('2026-10');
  });

  it('lee meses AAAA-MM', () => {
    expect(parseYearMonth('2026-10')).toEqual({ year: 2026, month: 10 });
    expect(code(() => parseYearMonth('2026-13'))).toBe('INVALID_DATE');
    expect(code(() => parseYearMonth('0000-01'))).toBe('INVALID_DATE');
    expect(code(() => parseYearMonth('2026-1'))).toBe('INVALID_DATE');
    expect(code(() => parseYearMonth(202610 as unknown as string))).toBe('INVALID_DATE');
  });

  it('formatea partes con ceros a la izquierda y valida el calendario', () => {
    expect(formatLocalDate({ year: 33, month: 2, day: 3 })).toBe('0033-02-03');
    expect(code(() => formatLocalDate({ year: 2026, month: 2, day: 29 }))).toBe('INVALID_DATE');
  });

  it('sumar n días y medir la distancia devuelve n', () => {
    fc.assert(
      fc.property(localDate, fc.integer({ min: -20_000, max: 20_000 }), (date, days) => {
        const moved = addDays(date, days);
        expect(daysBetween(date, moved)).toBe(days);
        expect(compareLocalDates(moved, date)).toBe(Math.sign(days));
      }),
      { numRuns: 2000 },
    );
  });

  it('sumar meses nunca produce una fecha inválida ni cambia de mes de más', () => {
    fc.assert(
      fc.property(localDate, fc.integer({ min: -600, max: 600 }), (date, months) => {
        const moved = addMonths(date, months);
        const from = parseLocalDate(date);
        const to = parseLocalDate(moved);
        expect(to.year * 12 + to.month - (from.year * 12 + from.month)).toBe(months);
        expect(to.day).toBe(Math.min(from.day, daysInMonth(to.year, to.month)));
      }),
      { numRuns: 2000 },
    );
  });
});

describe('fecha local de un instante (zona horaria)', () => {
  it('en Bogotá (UTC−5) las 03:00 UTC del 1 de noviembre aún son 31 de octubre', () => {
    const instant = new Date('2026-11-01T03:00:00Z');
    expect(localDateInTimeZone(instant, 'America/Bogota')).toBe('2026-10-31');
    expect(localDateInTimeZone(instant, 'UTC')).toBe('2026-11-01');
    expect(localDateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-11-01');
  });

  it('respeta el cambio de horario de verano', () => {
    // EE. UU. vuelve a UTC−5 el 1-nov-2026 a las 06:00 UTC.
    expect(localDateInTimeZone(new Date('2026-11-01T03:59:00Z'), 'America/New_York')).toBe(
      '2026-10-31',
    );
    expect(localDateInTimeZone(new Date('2026-11-01T04:00:00Z'), 'America/New_York')).toBe(
      '2026-11-01',
    );
  });

  it('maneja el 29 de febrero y el fin de año', () => {
    expect(localDateInTimeZone(new Date('2028-03-01T04:59:59Z'), 'America/Bogota')).toBe(
      '2028-02-29',
    );
    expect(localDateInTimeZone(new Date('2027-01-01T04:00:00Z'), 'America/Bogota')).toBe(
      '2026-12-31',
    );
  });

  it('rechaza instantes y zonas inválidas', () => {
    expect(code(() => localDateInTimeZone(new Date('x'), 'UTC'))).toBe('INVALID_DATE');
    expect(code(() => localDateInTimeZone('2026-10-07' as unknown as Date, 'UTC'))).toBe(
      'INVALID_DATE',
    );
    expect(code(() => localDateInTimeZone(new Date(), 'Marte/Olympus'))).toBe('INVALID_TIME_ZONE');
    expect(code(() => localDateInTimeZone(new Date(), 5 as unknown as string))).toBe(
      'INVALID_TIME_ZONE',
    );
  });
});

describe('rangos de fechas', () => {
  it('crea rangos inclusivos y rechaza rangos invertidos', () => {
    const range = createDateRange('2026-10-01', '2026-10-31');
    expect(isWithinRange('2026-10-01', range)).toBe(true);
    expect(isWithinRange('2026-10-31', range)).toBe(true);
    expect(isWithinRange('2026-11-01', range)).toBe(false);
    expect(isWithinRange('2026-09-30', range)).toBe(false);
    expect(createDateRange('2026-10-07', '2026-10-07')).toEqual({
      from: '2026-10-07',
      to: '2026-10-07',
    });
    expect(code(() => createDateRange('2026-10-08', '2026-10-07'))).toBe('INVALID_DATE_RANGE');
    expect(code(() => createDateRange('2026-10-08', 'mañana'))).toBe('INVALID_DATE');
  });

  it('construye meses completos, incluido febrero bisiesto', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(code(() => monthRange('2026-00'))).toBe('INVALID_DATE');
  });
});
