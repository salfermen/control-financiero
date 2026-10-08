import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { decimalString, positiveAmount, storableAmount } from '../test-support/arbitraries.js';
import { Decimal } from './decimal.js';
import { MAX_ABS_AMOUNT, Money } from './money.js';

const cop = (amount: string) => Money.of(amount, 'COP');
const usd = (amount: string) => Money.of(amount, 'USD');
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

describe('Money: creación', () => {
  it('crea montos exactos y los serializa con 4 decimales', () => {
    expect(cop('100000').toAmountString()).toBe('100000.0000');
    expect(usd('59.99').toJSON()).toEqual({ amount: '59.9900', currency: 'USD' });
    expect(usd('-0.5').toString()).toBe('-0.5000 USD');
    expect(JSON.stringify({ total: cop('25000') })).toBe(
      '{"total":{"amount":"25000.0000","currency":"COP"}}',
    );
  });

  it('rechaza más de 4 decimales en lugar de redondear en silencio', () => {
    expect(code(() => cop('1.23456'))).toBe('TOO_MANY_DECIMALS');
  });

  it('acepta los límites de NUMERIC(20,4) y rechaza lo que no cabe', () => {
    expect(cop(MAX_ABS_AMOUNT).toAmountString()).toBe(MAX_ABS_AMOUNT);
    expect(cop(`-${MAX_ABS_AMOUNT}`).isNegative()).toBe(true);
    expect(code(() => cop('10000000000000000'))).toBe('AMOUNT_OUT_OF_RANGE');
    expect(code(() => cop(MAX_ABS_AMOUNT).plus(cop('0.0001')))).toBe('AMOUNT_OUT_OF_RANGE');
  });

  it('rechaza formatos inválidos y monedas no soportadas', () => {
    expect(code(() => cop('1e3'))).toBe('INVALID_NUMBER');
    expect(code(() => cop('1.000'))).toBe('NO_ERROR'); // punto decimal, no de miles
    expect(code(() => Money.of('10', 'XYZ'))).toBe('UNSUPPORTED_CURRENCY');
    expect(code(() => Money.of('10', 'cop'))).toBe('UNSUPPORTED_CURRENCY');
    expect(code(() => Money.zero('XXX'))).toBe('UNSUPPORTED_CURRENCY');
    expect(code(() => Money.of('10', 7 as unknown as string))).toBe('UNSUPPORTED_CURRENCY');
  });

  it('trata cero como cero sin signo', () => {
    const zero = cop('-0');
    expect(zero.isZero()).toBe(true);
    expect(zero.isNegative()).toBe(false);
    expect(zero.toAmountString()).toBe('0.0000');
    expect(cop('5').minus(cop('5')).negated().toAmountString()).toBe('0.0000');
  });

  it('fromDecimal redondea explícitamente y valida el valor', () => {
    expect(Money.fromDecimal(new Decimal('1.23455'), 'USD').toAmountString()).toBe('1.2346');
    expect(Money.fromDecimal(new Decimal('1.23455'), 'USD', 'half_even').toAmountString()).toBe(
      '1.2346',
    );
    expect(Money.fromDecimal(new Decimal('1.23445'), 'USD', 'half_even').toAmountString()).toBe(
      '1.2344',
    );
    expect(code(() => Money.fromDecimal(new Decimal(NaN), 'USD'))).toBe('INVALID_NUMBER');
    expect(code(() => Money.fromDecimal(new Decimal(Infinity), 'USD'))).toBe('INVALID_NUMBER');
    expect(code(() => Money.fromDecimal('1' as unknown as Decimal, 'USD'))).toBe('NO_ERROR');
  });
});

describe('Money: aritmética', () => {
  it('suma y resta de forma exacta (ejemplo §10: 100000 + 25000 = 125000)', () => {
    expect(cop('100000').plus(cop('25000')).toAmountString()).toBe('125000.0000');
    expect(usd('0.1').plus(usd('0.2')).equals(usd('0.3'))).toBe(true);
    expect(cop('10').minus(cop('25.5')).toAmountString()).toBe('-15.5000');
  });

  it('no mezcla monedas sin conversión explícita', () => {
    expect(code(() => cop('1').plus(usd('1')))).toBe('CURRENCY_MISMATCH');
    expect(code(() => cop('1').compare(usd('1')))).toBe('CURRENCY_MISMATCH');
    expect(code(() => cop('1').ratioTo(usd('1')))).toBe('CURRENCY_MISMATCH');
    expect(cop('1').equals(usd('1'))).toBe(false);
  });

  it('multiplica con redondeo explícito', () => {
    expect(usd('59.99').times('4050').toAmountString()).toBe('242959.5000');
    expect(cop('100000').times('0.19').toAmountString()).toBe('19000.0000'); // IVA 19 %
    expect(cop('1').times('0.00005').toAmountString()).toBe('0.0001');
    expect(cop('1').times('0.00005', 'down').toAmountString()).toBe('0.0000');
    expect(cop('-1').times('0.00005', 'half_up').toAmountString()).toBe('-0.0001');
    expect(cop('10').times(new Decimal('1.5')).toAmountString()).toBe('15.0000');
    expect(code(() => cop('10').times('abc'))).toBe('INVALID_NUMBER');
    expect(code(() => cop('10').times(new Decimal(NaN)))).toBe('INVALID_NUMBER');
  });

  it('divide de forma exacta', () => {
    expect(cop('100000').dividedBy('3').toAmountString()).toBe('33333.3333');
    expect(cop('100000').dividedBy('3', 'up').toAmountString()).toBe('33333.3334');
    expect(code(() => cop('1').dividedBy('0'))).toBe('DIVISION_BY_ZERO');
  });

  it('calcula proporciones', () => {
    expect(cop('250000').ratioTo(cop('1000000'))).toBe('0.2500');
    expect(cop('1').ratioTo(cop('3'), 6)).toBe('0.333333');
    expect(code(() => cop('1').ratioTo(cop('0')))).toBe('DIVISION_BY_ZERO');
  });

  it('negativos, valor absoluto y comparaciones', () => {
    const a = cop('-1500.25');
    expect(a.abs().toAmountString()).toBe('1500.2500');
    expect(a.negated().isPositive()).toBe(true);
    expect(a.lessThan(cop('0'))).toBe(true);
    expect(cop('2').greaterThan(cop('1.9999'))).toBe(true);
    expect(cop('2').greaterThanOrEqual(cop('2.0000'))).toBe(true);
    expect(cop('2').lessThanOrEqual(cop('2'))).toBe(true);
    expect(cop('2').compare(cop('3'))).toBe(-1);
    expect(cop('3').compare(cop('3'))).toBe(0);
    expect(cop('10').equals(cop('10.0000'))).toBe(true);
  });

  it('suma listas, incluida la vacía', () => {
    expect(Money.sum([], 'COP').toAmountString()).toBe('0.0000');
    expect(Money.sum([cop('1'), cop('2.5')], 'COP').toAmountString()).toBe('3.5000');
    expect(code(() => Money.sum([usd('1')], 'COP'))).toBe('CURRENCY_MISMATCH');
  });

  it('redondea a la escala pedida y a la de visualización', () => {
    expect(cop('242959.5').roundForDisplay().toAmountString()).toBe('242960.0000');
    expect(cop('242959.4999').roundForDisplay().toAmountString()).toBe('242959.0000');
    expect(usd('10.005').roundForDisplay().toAmountString()).toBe('10.0100');
    expect(Money.of('1234.5', 'JPY').roundForDisplay().toAmountString()).toBe('1235.0000');
    expect(cop('2.5').round(0, 'half_even').toAmountString()).toBe('2.0000');
    expect(() => cop('1').round(5)).toThrowError(RangeError);
    expect(() => cop('1').round(-1)).toThrowError(RangeError);
  });
});

describe('Money: propiedades', () => {
  const pair = fc.tuple(storableAmount, storableAmount);

  it('la suma es conmutativa y restar deshace sumar', () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        const x = cop(a);
        const y = cop(b);
        try {
          const sum = x.plus(y);
          expect(sum.equals(y.plus(x))).toBe(true);
          expect(sum.minus(y).equals(x)).toBe(true);
        } catch (error) {
          // Solo se admite el desborde explícito de NUMERIC(20,4).
          expect((error as DomainError).code).toBe('AMOUNT_OUT_OF_RANGE');
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('la suma es asociativa (no hay errores de redondeo acumulados)', () => {
    const small = decimalString({ maxIntegerDigits: 12, maxScale: 4 });
    fc.assert(
      fc.property(small, small, small, (a, b, c) => {
        const left = cop(a).plus(cop(b)).plus(cop(c));
        const right = cop(a).plus(cop(b).plus(cop(c)));
        expect(left.equals(right)).toBe(true);
      }),
    );
  });

  it('serializar y volver a leer conserva el valor exacto', () => {
    fc.assert(
      fc.property(storableAmount, (a) => {
        const money = cop(a);
        expect(cop(money.toAmountString()).equals(money)).toBe(true);
      }),
    );
  });
});

describe('Money: reparto sin pérdidas', () => {
  it('divide 100.000 COP en 3 cuotas de pesos enteros', () => {
    expect(
      cop('100000')
        .splitEvenly(3)
        .map((m) => m.toAmountString()),
    ).toEqual(['33334.0000', '33333.0000', '33333.0000']);
  });

  it('respeta la escala pedida y la de la moneda', () => {
    expect(
      usd('100')
        .splitEvenly(3)
        .map((m) => m.toAmountString()),
    ).toEqual(['33.3400', '33.3300', '33.3300']);
    expect(
      cop('100000')
        .splitEvenly(3, { scale: 4 })
        .map((m) => m.toAmountString()),
    ).toEqual(['33333.3334', '33333.3333', '33333.3333']);
  });

  it('usa los decimales del monto si son más que la escala', () => {
    const parts = cop('100.5').splitEvenly(2);
    // 100.5 tiene 1 decimal: se reparte en décimas.
    expect(parts.map((m) => m.toAmountString())).toEqual(['50.3000', '50.2000']);
  });

  it('reparte por pesos y da el sobrante al mayor resto', () => {
    const parts = cop('1000').allocate(['1', '1', '1', '0']);
    expect(parts.map((m) => m.toAmountString())).toEqual([
      '334.0000',
      '333.0000',
      '333.0000',
      '0.0000',
    ]);
    const weighted = cop('100').allocate(['0.7', '0.2', '0.1']);
    expect(weighted.map((m) => m.toAmountString())).toEqual(['70.0000', '20.0000', '10.0000']);
  });

  it('reparte montos negativos y cero', () => {
    expect(
      cop('-100')
        .splitEvenly(3)
        .map((m) => m.toAmountString()),
    ).toEqual(['-34.0000', '-33.0000', '-33.0000']);
    expect(
      cop('0')
        .splitEvenly(2)
        .every((m) => m.isZero()),
    ).toBe(true);
  });

  it('valida pesos y partes', () => {
    expect(code(() => cop('1').allocate([]))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').allocate(['0', '0']))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').allocate(['-1', '2']))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').allocate(['x']))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').allocate(['1'], { scale: 5 }))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').splitEvenly(0))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').splitEvenly(1.5))).toBe('INVALID_ALLOCATION');
    expect(code(() => cop('1').splitEvenly(10_001))).toBe('INVALID_ALLOCATION');
  });

  it('la suma de las partes siempre es exactamente el total', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        fc
          .array(decimalString({ maxIntegerDigits: 3, maxScale: 2, min: 'zero' }), {
            minLength: 1,
            maxLength: 12,
          })
          .filter((ws) => ws.some((w) => /[1-9]/.test(w))),
        fc.integer({ min: 0, max: 4 }),
        fc.boolean(),
        (amount, weights, scale, negative) => {
          const total = cop(negative ? `-${amount}` : amount);
          const parts = total.allocate(weights, { scale });
          expect(parts).toHaveLength(weights.length);
          expect(Money.sum(parts, 'COP').equals(total)).toBe(true);
        },
      ),
      { numRuns: 1500 },
    );
  });
});
