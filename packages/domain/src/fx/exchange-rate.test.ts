import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { Decimal } from '../money/decimal.js';
import { Money } from '../money/money.js';
import { positiveAmount, positiveRate } from '../test-support/arbitraries.js';
import {
  type ExchangeRateInput,
  convert,
  createExchangeRate,
  impliedRate,
} from './exchange-rate.js';

const usdCop = (rate = '4050', extra: Partial<ExchangeRateInput> = {}) =>
  createExchangeRate({
    baseCurrency: 'USD',
    quoteCurrency: 'COP',
    rate,
    rateDate: '2026-10-07',
    source: 'test-rate',
    ...extra,
  });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

describe('createExchangeRate', () => {
  it('normaliza la tasa a 10 decimales y conserva la procedencia', () => {
    const rate = usdCop('4050', { id: 'rate-1', source: '  banrep-trm  ' });
    expect(rate).toEqual({
      baseCurrency: 'USD',
      quoteCurrency: 'COP',
      rate: '4050.0000000000',
      rateDate: '2026-10-07',
      validUntil: null,
      source: 'banrep-trm',
      id: 'rate-1',
    });
    expect(Object.isFrozen(rate)).toBe(true);
    expect(usdCop().id).toBeNull();
  });

  it.each([
    ['0', 'INVALID_RATE'],
    ['-4050', 'INVALID_RATE'],
    ['4050.12345678901', 'INVALID_RATE'],
    ['4,050', 'INVALID_RATE'],
    ['1e3', 'INVALID_RATE'],
    ['100000000000000', 'RATE_OUT_OF_RANGE'],
  ])('rechaza la tasa %s (%s)', (rate, expected) => {
    expect(code(() => usdCop(rate))).toBe(expected);
  });

  it('exige fuente, fecha válida y dos monedas soportadas distintas', () => {
    expect(code(() => usdCop('4050', { source: '   ' }))).toBe('INVALID_RATE');
    expect(code(() => usdCop('4050', { source: 'x'.repeat(61) }))).toBe('INVALID_RATE');
    expect(code(() => usdCop('4050', { source: undefined as unknown as string }))).toBe(
      'INVALID_RATE',
    );
    expect(code(() => usdCop('4050', { rateDate: '2026-02-30' }))).toBe('INVALID_DATE');
    expect(code(() => usdCop('4050', { quoteCurrency: 'USD' }))).toBe('INVALID_RATE');
    expect(code(() => usdCop('4050', { quoteCurrency: 'XYZ' }))).toBe('UNSUPPORTED_CURRENCY');
  });
});

describe('convert', () => {
  it('convierte en el sentido de la tasa (ejemplo del prompt: 59,99 USD a 4.050)', () => {
    const result = convert(Money.of('59.99', 'USD'), usdCop());
    expect(result.to.toAmountString()).toBe('242959.5000');
    expect(result.to.currency).toBe('COP');
    expect(result.from.toAmountString()).toBe('59.9900');
    expect(result.appliedRate).toBe('4050.0000000000');
    expect(result.inverted).toBe(false);
    expect(result.rate.source).toBe('test-rate');
  });

  it('convierte en sentido inverso por división exacta', () => {
    const result = convert(Money.of('100000', 'COP'), usdCop('3999.5'));
    expect(result.to.toAmountString()).toBe('25.0031');
    expect(result.to.currency).toBe('USD');
    expect(result.appliedRate).toBe('0.0002500313');
    expect(result.inverted).toBe(true);
  });

  it('aplica el modo de redondeo pedido', () => {
    const rate = usdCop('3999.99');
    expect(convert(Money.of('0.01', 'USD'), rate).to.toAmountString()).toBe('39.9999');
    expect(convert(Money.of('0.0001', 'USD'), rate, 'down').to.toAmountString()).toBe('0.3999');
    expect(convert(Money.of('0.0001', 'USD'), rate, 'up').to.toAmountString()).toBe('0.4000');
  });

  it('convierte cero y negativos', () => {
    expect(convert(Money.of('0', 'USD'), usdCop()).to.isZero()).toBe(true);
    expect(convert(Money.of('-10', 'USD'), usdCop()).to.toAmountString()).toBe('-40500.0000');
  });

  it('rechaza una tasa de otro par', () => {
    expect(code(() => convert(Money.of('10', 'EUR'), usdCop()))).toBe('RATE_PAIR_MISMATCH');
  });

  it('rechaza una inversión que no cabe en 10 decimales', () => {
    const huge = usdCop('99999999999999');
    expect(code(() => convert(Money.of('1', 'COP'), huge))).toBe('RATE_OUT_OF_RANGE');
  });

  it('ida en el sentido de la tasa = producto exacto redondeado', () => {
    fc.assert(
      fc.property(positiveAmount, positiveRate, (amount, rate) => {
        let exchange;
        try {
          exchange = usdCop(rate);
        } catch {
          return; // tasa que redondea a 0: ya probado arriba
        }
        let converted;
        try {
          converted = convert(Money.of(amount, 'USD'), exchange).to;
        } catch (error) {
          expect((error as DomainError).code).toBe('AMOUNT_OUT_OF_RANGE');
          return;
        }
        const expected = new Decimal(amount).times(rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        expect(converted.toDecimal().equals(expected)).toBe(true);
      }),
      { numRuns: 1500 },
    );
  });

  it('ida y vuelta difiere a lo sumo en el error de redondeo esperado', () => {
    fc.assert(
      fc.property(positiveAmount, positiveRate, (amount, rate) => {
        let exchange;
        let there;
        try {
          exchange = usdCop(rate);
          there = convert(Money.of(amount, 'USD'), exchange).to;
        } catch {
          return;
        }
        const back = convert(there, exchange).to;
        // |back − original| ≤ 0.00005 / tasa + 0.00005 (dos redondeos a 4 decimales).
        const tolerance = new Decimal('0.00005').dividedBy(exchange.rate).plus('0.00005');
        expect(back.toDecimal().minus(amount).abs().lessThanOrEqualTo(tolerance)).toBe(true);
      }),
      { numRuns: 1500 },
    );
  });
});

describe('impliedRate', () => {
  it('deduce la tasa del valor real cobrado', () => {
    expect(impliedRate(Money.of('59.99', 'USD'), Money.of('243500', 'COP'))).toBe(
      '4059.0098349725',
    );
    expect(impliedRate(Money.of('10', 'USD'), Money.of('40500', 'COP'))).toBe('4050.0000000000');
  });

  it('exige montos positivos de monedas distintas', () => {
    expect(code(() => impliedRate(Money.of('0', 'USD'), Money.of('1', 'COP')))).toBe(
      'INVALID_RATE',
    );
    expect(code(() => impliedRate(Money.of('1', 'USD'), Money.of('-1', 'COP')))).toBe(
      'INVALID_RATE',
    );
    expect(code(() => impliedRate(Money.of('1', 'COP'), Money.of('2', 'COP')))).toBe(
      'INVALID_RATE',
    );
  });

  it('rechaza tasas implícitas fuera de rango', () => {
    expect(
      code(() => impliedRate(Money.of('9999999999999999', 'COP'), Money.of('0.0001', 'USD'))),
    ).toBe('RATE_OUT_OF_RANGE');
  });
});

describe('vigencia de la tasa', () => {
  it('acepta y valida la vigencia', () => {
    expect(usdCop('4050', { validUntil: '2026-10-10' }).validUntil).toBe('2026-10-10');
    expect(code(() => usdCop('4050', { validUntil: '2026-10-06' }))).toBe('INVALID_RATE');
    expect(code(() => usdCop('4050', { validUntil: '2026-13-01' }))).toBe('INVALID_DATE');
  });
});
