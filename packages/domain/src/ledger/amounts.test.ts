import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { createExchangeRate } from '../fx/exchange-rate.js';
import { Money } from '../money/money.js';
import { positiveAmount, positiveRate } from '../test-support/arbitraries.js';
import { testEntry } from '../test-support/ledger-fixtures.js';
import { type LedgerAmountsInput, prepareLedgerAmounts } from './amounts.js';
import { assertValidLedgerEntry } from './entry.js';

const at = new Date('2026-10-07T15:00:00Z');
const rate = (
  base: string,
  quote: string,
  value: string,
  source = 'banrep-trm',
  id: string | null = 'r-1',
) =>
  createExchangeRate({
    baseCurrency: base,
    quoteCurrency: quote,
    rate: value,
    rateDate: '2026-10-07',
    source,
    id,
  });
const trm = rate('USD', 'COP', '4050');
const prepare = (input: Partial<LedgerAmountsInput> & Pick<LedgerAmountsInput, 'original'>) =>
  prepareLedgerAmounts({ accountCurrency: 'COP', baseCurrency: 'COP', convertedAt: at, ...input });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

describe('montos del libro', () => {
  it('sin cambio de moneda: los tres montos iguales y sin tasas', () => {
    expect(prepare({ original: Money.of('25000', 'COP') })).toEqual({
      originalAmount: '25000.0000',
      originalCurrency: 'COP',
      amount: '25000.0000',
      accountCurrency: 'COP',
      accountFxRate: null,
      baseAmount: '25000.0000',
      baseCurrency: 'COP',
      baseFxRate: null,
      fxSource: null,
      fxConvertedAt: null,
      fxRateId: null,
    });
  });

  it('compra en USD con cuenta y base en COP (ejemplo §6 del prompt)', () => {
    const result = prepare({
      original: Money.of('59.99', 'USD'),
      accountConversion: { kind: 'rate', rate: trm },
    });
    expect(result).toMatchObject({
      originalAmount: '59.9900',
      originalCurrency: 'USD',
      amount: '242959.5000',
      accountFxRate: '4050.0000000000',
      baseAmount: '242959.5000',
      baseFxRate: '4050.0000000000',
      fxSource: 'banrep-trm',
      fxConvertedAt: at,
      fxRateId: 'r-1',
    });
  });

  it('el valor real del extracto manda y la tasa se deduce (decisión 4)', () => {
    const result = prepare({
      original: Money.of('59.99', 'USD'),
      accountConversion: { kind: 'settled', amount: '243500', source: ' statement ' },
    });
    expect(result).toMatchObject({
      amount: '243500.0000',
      accountFxRate: '4059.0098349725',
      baseAmount: '243500.0000',
      baseFxRate: '4059.0098349725',
      fxSource: 'statement',
      fxRateId: null,
    });
  });

  it('cuenta en USD con base COP: solo convierte a la base', () => {
    const result = prepare({
      original: Money.of('100', 'USD'),
      accountCurrency: 'USD',
      baseRate: trm,
    });
    expect(result).toMatchObject({
      amount: '100.0000',
      accountFxRate: null,
      baseAmount: '405000.0000',
      baseFxRate: '4050.0000000000',
      fxSource: 'banrep-trm',
      fxRateId: 'r-1',
    });
  });

  it('compra en COP pagada desde una cuenta en USD (tasa en sentido inverso)', () => {
    const result = prepare({
      original: Money.of('405000', 'COP'),
      accountCurrency: 'USD',
      accountConversion: { kind: 'rate', rate: trm },
    });
    expect(result).toMatchObject({
      amount: '100.0000',
      accountFxRate: '0.0002469136',
      baseFxRate: null,
    });
  });

  it('tres monedas: EUR original, cuenta USD y base COP con cadena por la cuenta', () => {
    const eurUsd = rate('EUR', 'USD', '1.08', 'ecb', 'r-2');
    const result = prepare({
      original: Money.of('50', 'EUR'),
      accountCurrency: 'USD',
      accountConversion: { kind: 'rate', rate: eurUsd },
      baseRate: trm,
    });
    expect(result).toMatchObject({
      amount: '54.0000',
      accountFxRate: '1.0800000000',
      baseAmount: '218700.0000',
      baseFxRate: '4374.0000000000',
      fxSource: 'ecb + banrep-trm',
      fxRateId: null,
    });
  });

  it('tres monedas con tasa directa original → base', () => {
    const eurUsd = rate('EUR', 'USD', '1.08', 'ecb', 'r-2');
    const eurCop = rate('EUR', 'COP', '4380', 'ecb', 'r-3');
    const result = prepare({
      original: Money.of('50', 'EUR'),
      accountCurrency: 'USD',
      accountConversion: { kind: 'rate', rate: eurUsd },
      baseRate: eurCop,
    });
    expect(result).toMatchObject({
      baseAmount: '219000.0000',
      baseFxRate: '4380.0000000000',
      fxSource: 'ecb',
    });
  });

  it('rechaza conversiones faltantes, sobrantes o del par equivocado', () => {
    expect(code(() => prepare({ original: Money.of('1', 'USD') }))).toBe('MISSING_EXCHANGE_RATE');
    expect(
      code(() =>
        prepare({ original: Money.of('1', 'COP'), accountConversion: { kind: 'rate', rate: trm } }),
      ),
    ).toBe('UNEXPECTED_CONVERSION');
    expect(code(() => prepare({ original: Money.of('1', 'COP'), baseRate: trm }))).toBe(
      'UNEXPECTED_CONVERSION',
    );
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'USD'),
          accountConversion: { kind: 'rate', rate: trm },
          baseRate: trm,
        }),
      ),
    ).toBe('UNEXPECTED_CONVERSION');
    expect(
      code(() =>
        prepare({ original: Money.of('1', 'EUR'), accountConversion: { kind: 'rate', rate: trm } }),
      ),
    ).toBe('RATE_PAIR_MISMATCH');
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'USD'),
          accountCurrency: 'EUR',
          accountConversion: { kind: 'rate', rate: trm },
        }),
      ),
    ).toBe('RATE_PAIR_MISMATCH');
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'EUR'),
          accountCurrency: 'USD',
          accountConversion: { kind: 'settled', amount: '1.08', source: 'statement' },
        }),
      ),
    ).toBe('MISSING_EXCHANGE_RATE');
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'EUR'),
          accountCurrency: 'USD',
          accountConversion: { kind: 'settled', amount: '1.08', source: 'statement' },
          baseRate: rate('GBP', 'JPY', '190'),
        }),
      ),
    ).toBe('RATE_PAIR_MISMATCH');
  });

  it('rechaza montos no positivos, conversiones que redondean a cero y fechas inválidas', () => {
    expect(code(() => prepare({ original: Money.of('0', 'COP') }))).toBe('NON_POSITIVE_AMOUNT');
    expect(code(() => prepare({ original: Money.of('-5', 'COP') }))).toBe('NON_POSITIVE_AMOUNT');
    expect(
      code(() =>
        prepare({
          original: Money.of('0.0001', 'COP'),
          accountCurrency: 'USD',
          accountConversion: { kind: 'rate', rate: trm },
        }),
      ),
    ).toBe('AMOUNT_ROUNDS_TO_ZERO');
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'USD'),
          accountConversion: { kind: 'settled', amount: '0', source: 'statement' },
        }),
      ),
    ).toBe('NON_POSITIVE_AMOUNT');
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'USD'),
          accountConversion: { kind: 'settled', amount: '1', source: '' },
        }),
      ),
    ).toBe('INVALID_RATE');
    expect(
      code(() => prepare({ original: Money.of('1', 'COP'), convertedAt: new Date('x') })),
    ).toBe('INVALID_DATE');
    expect(code(() => prepare({ original: Money.of('1', 'COP'), accountCurrency: 'XYZ' }))).toBe(
      'UNSUPPORTED_CURRENCY',
    );
  });

  it('rechaza fuentes combinadas demasiado largas', () => {
    const longA = rate('EUR', 'USD', '1.08', 'a'.repeat(40));
    const longB = rate('USD', 'COP', '4050', 'b'.repeat(40));
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'EUR'),
          accountCurrency: 'USD',
          accountConversion: { kind: 'rate', rate: longA },
          baseRate: longB,
        }),
      ),
    ).toBe('INVALID_RATE');
  });

  it('rechaza una base que redondea a cero por la cadena', () => {
    const tinyCop = rate('COP', 'USD', '0.0000000001', 'x');
    expect(
      code(() =>
        prepare({
          original: Money.of('1', 'EUR'),
          accountCurrency: 'COP',
          accountConversion: { kind: 'settled', amount: '4380', source: 'statement' },
          baseCurrency: 'USD',
          baseRate: tinyCop,
        }),
      ),
    ).toBe('AMOUNT_ROUNDS_TO_ZERO');
  });
});

describe('propiedad: todo lo que prepara el motor cumple las reglas del libro', () => {
  it('para cualquier monto, tasa y combinación de monedas', () => {
    const currency = fc.constantFrom('COP', 'USD', 'EUR');
    fc.assert(
      fc.property(
        positiveAmount,
        currency,
        currency,
        currency,
        positiveRate,
        positiveRate,
        fc.boolean(),
        (amount, originalCurrency, accountCurrency, baseCurrency, r1, r2, settled) => {
          const original = Money.of(amount, originalCurrency);
          let result;
          try {
            result = prepareLedgerAmounts({
              original,
              accountCurrency,
              baseCurrency,
              convertedAt: at,
              accountConversion:
                originalCurrency === accountCurrency
                  ? undefined
                  : settled
                    ? { kind: 'settled', amount, source: 'statement' }
                    : { kind: 'rate', rate: rate(originalCurrency, accountCurrency, r1) },
              baseRate:
                originalCurrency === baseCurrency || accountCurrency === baseCurrency
                  ? undefined
                  : rate(originalCurrency, baseCurrency, r2),
            });
          } catch (error) {
            // Únicos rechazos admitidos: límites numéricos explícitos.
            expect(['AMOUNT_OUT_OF_RANGE', 'AMOUNT_ROUNDS_TO_ZERO', 'RATE_OUT_OF_RANGE']).toContain(
              (error as DomainError).code,
            );
            return;
          }
          expect(result.originalAmount).toBe(original.toAmountString());
          expect(() =>
            assertValidLedgerEntry(
              testEntry({
                ...result,
                fxConvertedAt: result.fxConvertedAt,
              }),
            ),
          ).not.toThrow();
        },
      ),
      { numRuns: 2000 },
    );
  });
});
