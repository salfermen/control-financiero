import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, isNegative, isZero, money, signedMoney } from './format';

const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formato en la web', () => {
  it('muestra montos con el motor y con signo según la dirección', () => {
    expect(plain(money({ amount: '242959.5000', currency: 'COP' }))).toBe('$ 242.960');
    expect(plain(signedMoney({ amount: '25000.0000', currency: 'COP' }, 'outflow'))).toBe(
      '−$ 25.000',
    );
    expect(plain(signedMoney({ amount: '25000.0000', currency: 'COP' }, 'inflow'))).toBe(
      '+$ 25.000',
    );
    expect(isNegative({ amount: '-1.0000', currency: 'COP' })).toBe(true);
    expect(isZero({ amount: '0.0000', currency: 'COP' })).toBe(true);
  });

  it('formatea fechas contables sin correrse de día', () => {
    expect(plain(formatDate('2026-10-31'))).toMatch(/^31 (de )?oct\.? (de )?2026$/);
    expect(formatDate('2028-02-29', 'en-US')).toBe('Feb 29, 2028');
    expect(formatMonth('2026-10')).toBe('octubre de 2026');
  });
});
