/**
 * SOLO PARA PRUEBAS. Generadores de fast-check para pruebas basadas en
 * propiedades: producen miles de casos (incluidos cero, negativos y valores
 * enormes) y fast-check reduce cualquier fallo al ejemplo mínimo.
 */
import fc from 'fast-check';

/** Convierte un entero escalado en texto decimal: (12345n, 2) → "123.45". */
export function scaledToString(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const integer = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  const body = scale === 0 ? integer : `${integer}.${fraction}`;
  return negative ? `-${body}` : body;
}

/** Texto decimal con hasta `maxScale` decimales y valor absoluto < 10^maxIntegerDigits. */
export function decimalString(options: {
  readonly maxIntegerDigits: number;
  readonly maxScale: number;
  readonly min?: 'negative' | 'zero' | 'positive';
}): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: options.maxScale }).chain((scale) => {
    const limit = 10n ** BigInt(options.maxIntegerDigits + scale) - 1n;
    const min = options.min === 'positive' ? 1n : options.min === 'zero' ? 0n : -limit;
    return fc.bigInt({ min, max: limit }).map((units) => scaledToString(units, scale));
  });
}

/** Monto que cabe en NUMERIC(20,4), con signo. */
export const storableAmount = decimalString({ maxIntegerDigits: 16, maxScale: 4 });

/** Monto positivo realista para movimientos (hasta 12 cifras enteras). */
export const positiveAmount = decimalString({ maxIntegerDigits: 12, maxScale: 4, min: 'positive' });

/** Tasa positiva con hasta 10 decimales. */
export const positiveRate = decimalString({ maxIntegerDigits: 6, maxScale: 10, min: 'positive' });

/** Fecha contable válida entre 1900 y 2199 (incluye 29 de febrero). */
export const localDate = fc
  .date({
    min: new Date('1900-01-01T00:00:00Z'),
    max: new Date('2199-12-31T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10));
