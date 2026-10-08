import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { parseAmountInput } from './input.js';

describe('parseAmountInput', () => {
  it.each([
    ['25000', '25000'],
    ['25.000', '25000'],
    ['1.250.000', '1250000'],
    ['$ 2.900.000', '2900000'],
    ['59,99', '59.99'],
    ['59.99', '59.99'],
    ['1.250,50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['0,5', '0.5'],
    ['1.250', '1250'],
    ['1,250', '1.250'],
    ['  1 250 000 ', '1250000'],
    ['007', '7'],
    ['0', '0'],
    ['12.3456', '12.3456'],
  ])('es-CO: %j → %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each([
    ['1.250', '1.250'],
    ['1,250', '1250'],
    ['1,250,000.75', '1250000.75'],
    ['59.99', '59.99'],
  ])('en-US: %j → %s', (input, expected) => {
    expect(parseAmountInput(input, { locale: 'en-US' })).toBe(expected);
  });

  it('acepta negativos solo si se piden', () => {
    expect(parseAmountInput('-1.500', { allowNegative: true })).toBe('-1500');
    expect(parseAmountInput('-0', { allowNegative: true })).toBe('0');
    expect(() => parseAmountInput('-1.500')).toThrowError(/formato válido/);
  });

  it.each([
    '',
    '   ',
    'abc',
    '1..2',
    '1.2.3',
    '12,34.5',
    '1.2,3,4',
    '25.00.0',
    '-',
    '$',
    '1e5',
    '١٢٣',
    'x'.repeat(65),
  ])('rechaza %j', (input) => {
    try {
      parseAmountInput(input);
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_NUMBER');
    }
  });

  it('rechaza valores que no son texto', () => {
    expect(() => parseAmountInput(25 as unknown as string)).toThrowError(/formato válido/);
  });
});
