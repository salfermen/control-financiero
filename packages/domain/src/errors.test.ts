import { describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES, DomainError, isDomainError } from './errors.js';

describe('DomainError', () => {
  it('lleva código estable, mensaje técnico y detalles', () => {
    const error = new DomainError('CURRENCY_MISMATCH', 'COP con USD', { left: 'COP' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('CURRENCY_MISMATCH');
    expect(error.details).toEqual({ left: 'COP' });
    expect(new DomainError('INVALID_DATE', 'x').details).toEqual({});
  });

  it('se distingue de otros errores', () => {
    expect(isDomainError(new DomainError('INVALID_DATE', 'x'))).toBe(true);
    expect(isDomainError(new RangeError('x'))).toBe(false);
    expect(isDomainError({ code: 'INVALID_DATE' })).toBe(false);
  });

  it('no repite códigos', () => {
    expect(new Set(DOMAIN_ERROR_CODES).size).toBe(DOMAIN_ERROR_CODES.length);
  });
});
