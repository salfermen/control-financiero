import { describe, expect, it } from 'vitest';
import { uuidv7, uuidv7Timestamp } from './uuid.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('produce el formato RFC 9562 con versión 7 y variante 10xx', () => {
    for (let i = 0; i < 200; i++) {
      expect(uuidv7()).toMatch(UUID_V7);
    }
  });

  it('codifica la marca de tiempo y la recupera', () => {
    const ts = Date.UTC(2026, 9, 7, 14, 35, 0, 123);
    expect(uuidv7Timestamp(uuidv7(ts))).toBe(ts);
  });

  it('se ordena por tiempo como texto', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
  });

  it('no repite identificadores', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => uuidv7(42)));
    expect(ids.size).toBe(5_000);
  });

  it('rechaza marcas de tiempo fuera de rango', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(2 ** 48)).toThrow(RangeError);
    expect(() => uuidv7(1.5)).toThrow(RangeError);
  });

  it('acepta los extremos válidos', () => {
    expect(uuidv7(0)).toMatch(UUID_V7);
    expect(uuidv7Timestamp(uuidv7(0xffff_ffff_ffff))).toBe(0xffff_ffff_ffff);
  });
});
