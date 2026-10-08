import { describe, expect, it } from 'vitest';
import { amountToInput, previewAmount, previewRate } from './amount-input';

const plain = (text: string | null) => text?.replace(/\s/g, ' ');

describe('campo de monto', () => {
  it('muestra cómo se interpretará lo escrito', () => {
    expect(previewAmount('25.000', 'COP', 'es-CO')).toMatchObject({ value: '25000', valid: true });
    expect(plain(previewAmount('25.000', 'COP', 'es-CO').message)).toBe('Se registrará: $ 25.000');
    expect(plain(previewAmount('59,99', 'USD', 'es-CO').message)).toBe('Se registrará: US$ 59,99');
    expect(previewAmount('-20.000', 'COP', 'es-CO', { allowNegative: true }).value).toBe('-20000');
  });

  it('explica los errores sin registrar nada', () => {
    expect(previewAmount('', 'COP', 'es-CO')).toEqual({ value: null, message: null, valid: false });
    expect(previewAmount('abc', 'COP', 'es-CO')).toMatchObject({ valid: false, value: null });
    expect(previewAmount('1,23456', 'COP', 'es-CO').message).toBe('Usa máximo 4 decimales.');
    expect(previewAmount('99999999999999999', 'COP', 'es-CO').message).toBe(
      'El monto es demasiado grande.',
    );
    expect(previewAmount('-5', 'COP', 'es-CO').valid).toBe(false);
  });

  it('interpreta tasas con más decimales que un monto', () => {
    expect(previewRate('0,000247', 'es-CO', 'COP', 'USD')).toMatchObject({
      value: '0.000247',
      valid: true,
      message: '1 COP = 0.000247 USD',
    });
    expect(previewRate('4.050,25', 'es-CO', 'USD', 'COP').value).toBe('4050.25');
    expect(previewRate('0', 'es-CO', 'USD', 'COP').valid).toBe(false);
    expect(previewRate('x', 'es-CO', 'USD', 'COP').valid).toBe(false);
    expect(previewRate('', 'es-CO', 'USD', 'COP').valid).toBe(false);
  });

  it('prepara montos de la API para editarlos sin cambiar su valor', () => {
    expect(amountToInput('100.1250', 'es-CO')).toBe('100,125');
    expect(previewAmount(amountToInput('100.1250', 'es-CO'), 'COP', 'es-CO').value).toBe('100.125');
    expect(amountToInput('1000000.0000', 'es-CO')).toBe('1000000');
    expect(amountToInput('0.0000', 'en-US')).toBe('0');
    expect(amountToInput('-20.5000', 'en-US')).toBe('-20.5');
  });
});
