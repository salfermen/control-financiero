import { Decimal as DecimalJs } from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { decimalString } from '../test-support/arbitraries.js';
import {
  Decimal,
  ROUNDING_MODES,
  type RoundingMode,
  divideToScale,
  normalizeZero,
  parseDecimal,
  roundToScale,
} from './decimal.js';

/** Oráculo independiente: división con 400 dígitos y un único redondeo final. */
const Oracle = DecimalJs.clone({ precision: 400, toExpNeg: -400, toExpPos: 400 });
const ORACLE_MODE: Record<RoundingMode, DecimalJs.Rounding> = {
  half_up: DecimalJs.ROUND_HALF_UP,
  half_even: DecimalJs.ROUND_HALF_EVEN,
  down: DecimalJs.ROUND_DOWN,
  up: DecimalJs.ROUND_UP,
  floor: DecimalJs.ROUND_FLOOR,
  ceil: DecimalJs.ROUND_CEIL,
};

describe('parseDecimal', () => {
  it.each(['0', '-0', '10', '-10.5', '0.0001', '00012.30', '9999999999999999.9999'])(
    'acepta %s',
    (input) => {
      expect(parseDecimal(input).toString()).toBe(new Decimal(input).toString());
    },
  );

  it.each([
    '',
    ' 1',
    '1 ',
    '1e5',
    '1E5',
    '+1',
    '1,000',
    '1.000,50',
    '.5',
    '5.',
    'NaN',
    'Infinity',
    '0x10',
    '1_000',
  ])('rechaza %j', (input) => {
    expect(() => parseDecimal(input)).toThrowError(DomainError);
  });

  it('rechaza valores que no son texto (nunca coma flotante)', () => {
    expect(() => parseDecimal(0.1 as unknown as string)).toThrowError(/no es un número decimal/);
    expect(() => parseDecimal(null as unknown as string)).toThrowError(DomainError);
  });

  it('rechaza textos excesivamente largos sin procesarlos', () => {
    expect(() => parseDecimal('1'.repeat(65))).toThrowError(DomainError);
  });

  it('usa el código de error indicado', () => {
    try {
      parseDecimal('x', 'INVALID_RATE', 'tasa');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_RATE');
      expect((error as DomainError).details).toMatchObject({ field: 'tasa', received: 'x' });
    }
  });

  it('normaliza -0 a 0', () => {
    expect(parseDecimal('-0.00').isNegative()).toBe(false);
    expect(normalizeZero(new Decimal('-0')).isNegative()).toBe(false);
  });

  it('suma 0,1 + 0,2 sin error binario', () => {
    expect(parseDecimal('0.1').plus(parseDecimal('0.2')).toString()).toBe('0.3');
  });
});

describe('roundToScale', () => {
  const cases: [string, RoundingMode, number, string][] = [
    ['2.5', 'half_up', 0, '3'],
    ['-2.5', 'half_up', 0, '-3'],
    ['2.5', 'half_even', 0, '2'],
    ['3.5', 'half_even', 0, '4'],
    ['-2.5', 'half_even', 0, '-2'],
    ['2.9', 'down', 0, '2'],
    ['-2.9', 'down', 0, '-2'],
    ['2.1', 'up', 0, '3'],
    ['-2.1', 'up', 0, '-3'],
    ['-2.1', 'floor', 0, '-3'],
    ['-2.9', 'ceil', 0, '-2'],
    ['242959.49999', 'half_up', 0, '242959'],
    ['1.23456', 'half_up', 4, '1.2346'],
    ['-0.00004', 'half_up', 4, '0'],
  ];
  it.each(cases)('%s con %s a %i decimales → %s', (value, mode, scale, expected) => {
    const rounded = roundToScale(new Decimal(value), scale, mode);
    expect(rounded.toString()).toBe(expected);
    expect(rounded.isNegative() && rounded.isZero()).toBe(false);
  });

  it('usa half_up por defecto', () => {
    expect(roundToScale(new Decimal('0.125'), 2).toString()).toBe('0.13');
  });

  it.each([-1, 21, 1.5, Number.NaN])('rechaza la escala %s', (scale) => {
    expect(() => roundToScale(new Decimal(1), scale)).toThrowError(RangeError);
  });
});

describe('divideToScale', () => {
  it('divide de forma exacta con cada modo', () => {
    const third = (mode: RoundingMode) =>
      divideToScale(new Decimal('100000'), new Decimal('3'), 4, mode).toString();
    expect(third('half_up')).toBe('33333.3333');
    expect(third('up')).toBe('33333.3334');
    expect(third('ceil')).toBe('33333.3334');
    expect(third('down')).toBe('33333.3333');
    expect(divideToScale(new Decimal('-100000'), new Decimal('3'), 4, 'floor').toString()).toBe(
      '-33333.3334',
    );
  });

  it('resuelve empates exactos según el modo', () => {
    // 1 / 8 = 0.125 → empate a 2 decimales.
    const eighth = (mode: RoundingMode) =>
      divideToScale(new Decimal(1), new Decimal(8), 2, mode).toString();
    expect(eighth('half_up')).toBe('0.13');
    expect(eighth('half_even')).toBe('0.12');
    expect(divideToScale(new Decimal(3), new Decimal(8), 2, 'half_even').toString()).toBe('0.38');
    expect(divideToScale(new Decimal(-1), new Decimal(8), 2, 'half_up').toString()).toBe('-0.13');
  });

  it('distingue un empate verdadero de un valor apenas superior a la mitad', () => {
    // Cociente = 0.125 + 1e-60: un redondeo previo a 50 dígitos lo vería como empate.
    const dividend = new Decimal('0.125').plus(new Decimal('1e-60'));
    expect(divideToScale(dividend, new Decimal(1), 2, 'half_even').toString()).toBe('0.13');
  });

  it('maneja divisores negativos y resultado cero sin signo', () => {
    expect(divideToScale(new Decimal('10'), new Decimal('-4'), 1, 'half_up').toString()).toBe(
      '-2.5',
    );
    const tiny = divideToScale(new Decimal('-0.0001'), new Decimal('1000'), 4, 'half_up');
    expect(tiny.isZero()).toBe(true);
    expect(tiny.isNegative()).toBe(false);
  });

  it('lanza DIVISION_BY_ZERO', () => {
    expect(() => divideToScale(new Decimal(1), new Decimal(0), 4)).toThrowError(
      expect.objectContaining({ code: 'DIVISION_BY_ZERO' }),
    );
  });

  it('rechaza valores fuera del rango de cálculo exacto', () => {
    expect(() => divideToScale(new Decimal('1e95'), new Decimal(3), 4)).toThrowError(RangeError);
  });

  it('coincide con un oráculo de alta precisión en miles de casos', () => {
    const operand = decimalString({ maxIntegerDigits: 16, maxScale: 10 });
    fc.assert(
      fc.property(
        operand,
        operand.filter((d) => !new Decimal(d).isZero()),
        fc.integer({ min: 0, max: 10 }),
        fc.constantFrom(...ROUNDING_MODES),
        (a, b, scale, mode) => {
          const expected = new Oracle(a)
            .dividedBy(new Oracle(b))
            .toDecimalPlaces(scale, ORACLE_MODE[mode]);
          const actual = divideToScale(new Decimal(a), new Decimal(b), scale, mode);
          expect(actual.equals(new Decimal(expected.toString()))).toBe(true);
        },
      ),
      { numRuns: 3000 },
    );
  });
});
