import { describe, expect, it } from 'vitest';
import {
  BASE_CURRENCY_DEFAULT,
  CURRENCIES,
  SYSTEM_CATEGORIES,
  getCurrency,
  isSupportedCurrency,
} from './index.js';

describe('registro de monedas', () => {
  it('usa códigos ISO 4217 de tres letras mayúsculas y sin duplicados', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('incluye todas las monedas exigidas por el prompt maestro', () => {
    for (const code of ['COP', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'BRL', 'MXN']) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it('mantiene decimales dentro de rango y nunca muestra más de los oficiales', () => {
    for (const c of CURRENCIES) {
      expect(c.minorUnit).toBeGreaterThanOrEqual(0);
      expect(c.minorUnit).toBeLessThanOrEqual(4);
      expect(c.displayDecimals).toBeLessThanOrEqual(c.minorUnit);
    }
  });

  it('declara COP con 2 decimales ISO pero 0 visibles (decisión A3)', () => {
    expect(getCurrency('COP')).toMatchObject({ minorUnit: 2, displayDecimals: 0 });
    expect(BASE_CURRENCY_DEFAULT).toBe('COP');
  });

  it('JPY no tiene decimales', () => {
    expect(getCurrency('JPY').minorUnit).toBe(0);
  });

  it('rechaza monedas no soportadas en lugar de inventar una definición', () => {
    expect(isSupportedCurrency('XXX')).toBe(false);
    expect(() => getCurrency('cop')).toThrow(RangeError);
    expect(() => getCurrency('')).toThrow(RangeError);
  });
});

describe('categorías del sistema', () => {
  it('tienen claves únicas en snake_case', () => {
    const keys = SYSTEM_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9_]{1,59}$/);
    }
  });

  it('las subcategorías apuntan a un padre existente del mismo tipo', () => {
    const byKey = new Map(SYSTEM_CATEGORIES.map((c) => [c.key, c]));
    for (const c of SYSTEM_CATEGORIES) {
      if (c.parentKey === undefined) continue;
      const parent = byKey.get(c.parentKey);
      expect(parent, `padre de ${c.key}`).toBeDefined();
      expect(parent?.kind).toBe(c.kind);
      expect(parent?.parentKey, 'solo se permite un nivel de anidación').toBeUndefined();
    }
  });

  it('cubre las 15 categorías de gasto del prompt y tiene ingresos', () => {
    const expense = SYSTEM_CATEGORIES.filter((c) => c.kind === 'expense');
    const income = SYSTEM_CATEGORIES.filter((c) => c.kind === 'income');
    expect(expense.length).toBe(15);
    expect(income.length).toBeGreaterThan(0);
  });

  it('videojuegos es subcategoría de entretenimiento', () => {
    const vg = SYSTEM_CATEGORIES.find((c) => c.key === 'video_games');
    expect(vg?.parentKey).toBe('entertainment');
  });
});
