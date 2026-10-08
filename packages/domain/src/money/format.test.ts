import { describe, expect, it } from 'vitest';
import { formatMoney, formatPercent, formatRate } from './format.js';
import { Money } from './money.js';

/** Intl usa espacios no separables; se normalizan para comparar. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoney', () => {
  it('muestra COP sin decimales y con separador de miles colombiano', () => {
    expect(plain(formatMoney(Money.of('242959.5', 'COP')))).toBe('$ 242.960');
    expect(plain(formatMoney(Money.of('2900000', 'COP')))).toBe('$ 2.900.000');
  });

  it('muestra USD con 2 decimales y redondeo half_up', () => {
    expect(plain(formatMoney(Money.of('59.99', 'USD'), { locale: 'en-US' }))).toBe('$59.99');
    expect(plain(formatMoney(Money.of('10.005', 'USD'), { locale: 'en-US' }))).toBe('$10.01');
    expect(plain(formatMoney(Money.of('59.99', 'USD')))).toBe('US$ 59,99');
  });

  it('permite mostrar el código o los 4 decimales guardados', () => {
    expect(plain(formatMoney(Money.of('1500', 'COP'), { currencyDisplay: 'code' }))).toBe(
      'COP 1.500',
    );
    expect(
      plain(formatMoney(Money.of('242959.5', 'COP'), { decimals: 'storage', locale: 'en-US' })),
    ).toBe('COP 242,959.5000');
  });

  it('con `exact` no redondea lo que la persona escribió', () => {
    expect(plain(formatMoney(Money.of('59.99', 'COP'), { decimals: 'exact' }))).toBe('$ 59,99');
    expect(plain(formatMoney(Money.of('25000', 'COP'), { decimals: 'exact' }))).toBe('$ 25.000');
    expect(
      plain(formatMoney(Money.of('10.5', 'USD'), { decimals: 'exact', locale: 'en-US' })),
    ).toBe('$10.50');
  });

  it('formatea negativos y cero', () => {
    expect(plain(formatMoney(Money.of('-1234.56', 'USD'), { locale: 'en-US' }))).toBe('-$1,234.56');
    expect(plain(formatMoney(Money.of('0', 'COP')))).toBe('$ 0');
    expect(plain(formatMoney(Money.of('-0.4', 'COP')))).toBe('$ 0');
  });

  it('no pierde precisión con montos de 16 cifras', () => {
    expect(plain(formatMoney(Money.of('9999999999999999.4', 'COP')))).toBe(
      '$ 9.999.999.999.999.999',
    );
    expect(plain(formatMoney(Money.of('1234567890123456.78', 'USD'), { locale: 'en-US' }))).toBe(
      '$1,234,567,890,123,456.78',
    );
  });

  it('reutiliza el formateador para la misma configuración', () => {
    const a = formatMoney(Money.of('1', 'JPY'), { locale: 'ja-JP' });
    const b = formatMoney(Money.of('1', 'JPY'), { locale: 'ja-JP' });
    expect(a).toBe(b);
  });
});

describe('formatPercent y formatRate', () => {
  it('formatea proporciones como porcentaje', () => {
    // El espacio antes de «%» varía entre versiones de ICU: se compara sin espacios.
    const squash = (text: string) => text.replace(/\s/g, '');
    expect(squash(formatPercent('0.0125'))).toBe('1,25%');
    expect(squash(formatPercent('0.0125', { signed: true }))).toBe('+1,25%');
    expect(squash(formatPercent('-0.01', { signed: true }))).toBe('-1,00%');
    expect(squash(formatPercent('0.48001', { decimals: 1 }))).toBe('48,0%');
    expect(plain(formatPercent('0.2500', { locale: 'en-US', decimals: 0 }))).toBe('25%');
  });

  it('formatea tasas en la moneda cotizada con 2 decimales', () => {
    expect(plain(formatRate('4050.1250000000', 'COP'))).toBe('$ 4.050,13');
    expect(plain(formatRate('1.0800000000', 'USD', { locale: 'en-US' }))).toBe('$1.08');
    expect(() => formatRate('abc', 'COP')).toThrowError(/tasa/);
  });
});
