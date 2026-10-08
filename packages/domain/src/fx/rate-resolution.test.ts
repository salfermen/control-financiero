import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { createExchangeRate } from './exchange-rate.js';
import { rateVariation, resolveRateForDate } from './rate-resolution.js';

const trm = (rateDate: string, rate: string, validUntil: string | null = null) =>
  createExchangeRate({
    baseCurrency: 'USD',
    quoteCurrency: 'COP',
    rate,
    rateDate,
    validUntil,
    source: 'superfinanciera-trm',
  });

// TRM del viernes vigente sábado a lunes; martes con su propia tasa.
const rates = [
  trm('2026-10-02', '4000', '2026-10-05'),
  trm('2026-10-06', '4010'),
  trm('2026-10-07', '4020'),
];

describe('resolveRateForDate', () => {
  it('usa la tasa del día cuando existe', () => {
    const result = resolveRateForDate(rates, '2026-10-07');
    expect(result).toMatchObject({ status: 'current', rate: { rate: '4020.0000000000' } });
  });

  it('usa la tasa del viernes durante el fin de semana y el festivo', () => {
    for (const day of ['2026-10-03', '2026-10-04', '2026-10-05']) {
      expect(resolveRateForDate(rates, day)).toMatchObject({
        status: 'current',
        rate: { rateDate: '2026-10-02' },
      });
    }
  });

  it('marca como desactualizada una tasa que ya no rige', () => {
    expect(resolveRateForDate(rates, '2026-10-10')).toMatchObject({
      status: 'stale',
      rate: { rateDate: '2026-10-07' },
      daysOutdated: 3,
    });
  });

  it('nunca usa una tasa futura ni inventa una', () => {
    expect(resolveRateForDate(rates, '2026-10-01')).toEqual({ status: 'missing' });
    expect(resolveRateForDate([], '2026-10-07')).toEqual({ status: 'missing' });
  });

  it('el orden de las candidatas no importa', () => {
    expect(resolveRateForDate([...rates].reverse(), '2026-10-06')).toMatchObject({
      status: 'current',
      rate: { rate: '4010.0000000000' },
    });
  });

  it('rechaza mezclar pares y fechas inválidas', () => {
    const eur = createExchangeRate({
      baseCurrency: 'EUR',
      quoteCurrency: 'COP',
      rate: '4400',
      rateDate: '2026-10-07',
      source: 'x',
    });
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return (error as DomainError).code;
      }
      return 'NO_ERROR';
    };
    expect(code(() => resolveRateForDate([...rates, eur], '2026-10-07'))).toBe(
      'RATE_PAIR_MISMATCH',
    );
    expect(code(() => resolveRateForDate(rates, 'ayer'))).toBe('INVALID_DATE');
  });
});

describe('rateVariation', () => {
  it('calcula la variación absoluta y relativa', () => {
    expect(rateVariation(trm('2026-10-07', '4050'), trm('2026-10-06', '4000'))).toEqual({
      absolute: '50.0000000000',
      relative: '0.0125',
    });
    expect(rateVariation(trm('2026-10-07', '3960'), trm('2026-10-06', '4000'))).toEqual({
      absolute: '-40.0000000000',
      relative: '-0.0100',
    });
  });

  it('solo compara tasas del mismo par', () => {
    const eur = createExchangeRate({
      baseCurrency: 'EUR',
      quoteCurrency: 'COP',
      rate: '4400',
      rateDate: '2026-10-07',
      source: 'x',
    });
    expect(() => rateVariation(eur, trm('2026-10-06', '4000'))).toThrowError(/mismo par/);
  });
});
