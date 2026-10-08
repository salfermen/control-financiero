import { describe, expect, it } from 'vitest';
import { formatMoney } from './format.js';
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
