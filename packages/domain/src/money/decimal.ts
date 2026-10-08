import { Decimal as DecimalJs } from 'decimal.js';
import { DomainError, type DomainErrorCode } from '../errors.js';

/**
 * Aritmética decimal exacta del motor financiero (uso interno de @cf/domain).
 *
 * Se usa una copia aislada de decimal.js para que ninguna otra librería pueda
 * cambiar su configuración global. Con 100 dígitos significativos, sumas y
 * productos de montos NUMERIC(20,4) y tasas NUMERIC(24,10) son exactos: el
 * único redondeo es el que pide explícitamente quien llama.
 *
 * Este módulo NO se exporta fuera del paquete: las apps trabajan con `Money`
 * y strings, nunca hacen cálculos propios (§9 de AGENTS.md).
 */
export const Decimal = DecimalJs.clone({
  precision: 100,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -100,
  toExpPos: 100,
});
export type Decimal = DecimalJs;

/**
 * Modos de redondeo admitidos.
 *
 * - `half_up`: al más cercano; empates lejos de cero (2,5 → 3; -2,5 → -3).
 *   Es el redondeo comercial habitual y el que aplica PostgreSQL a NUMERIC.
 *   Es el modo por defecto del motor.
 * - `half_even`: al más cercano; empates al par (redondeo bancario).
 * - `down`: hacia cero (trunca). `up`: lejos de cero.
 * - `floor`: hacia −∞. `ceil`: hacia +∞.
 */
export const ROUNDING_MODES = ['half_up', 'half_even', 'down', 'up', 'floor', 'ceil'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const DEFAULT_ROUNDING: RoundingMode = 'half_up';

const DECIMAL_JS_MODE: Readonly<Record<RoundingMode, DecimalJs.Rounding>> = {
  half_up: DecimalJs.ROUND_HALF_UP,
  half_even: DecimalJs.ROUND_HALF_EVEN,
  down: DecimalJs.ROUND_DOWN,
  up: DecimalJs.ROUND_UP,
  floor: DecimalJs.ROUND_FLOOR,
  ceil: DecimalJs.ROUND_CEIL,
};

/** Solo dígitos, signo menos opcional y punto decimal. Sin exponentes ni separadores de miles. */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
/** Límite defensivo: evita procesar textos gigantes antes de validar el rango. */
const MAX_INPUT_LENGTH = 64;

/** Convierte -0 en 0 para que comparaciones y textos sean estables. */
export function normalizeZero(value: Decimal): Decimal {
  return value.isZero() ? new Decimal(0) : value;
}

/**
 * Lee un decimal desde texto con formato estricto. Nunca acepta `number`
 * (coma flotante) ni notación científica.
 */
export function parseDecimal(
  input: string,
  errorCode: DomainErrorCode = 'INVALID_NUMBER',
  field = 'valor',
): Decimal {
  if (
    typeof input !== 'string' ||
    input.length > MAX_INPUT_LENGTH ||
    !DECIMAL_PATTERN.test(input)
  ) {
    throw new DomainError(errorCode, `${field} no es un número decimal válido.`, {
      field,
      received: typeof input === 'string' ? input.slice(0, MAX_INPUT_LENGTH) : typeof input,
    });
  }
  return normalizeZero(new Decimal(input));
}

export function roundToScale(
  value: Decimal,
  scale: number,
  mode: RoundingMode = DEFAULT_ROUNDING,
): Decimal {
  assertScale(scale);
  return normalizeZero(value.toDecimalPlaces(scale, DECIMAL_JS_MODE[mode]));
}

/**
 * División exacta redondeada a `scale` decimales.
 *
 * decimal.js redondea el cociente a la precisión configurada antes de que
 * podamos aplicar nuestro redondeo, lo que en teoría permite un doble
 * redondeo. Aquí el cociente se calcula con enteros (BigInt) y el resto
 * exacto decide el redondeo: el resultado es correcto en todos los casos.
 */
export function divideToScale(
  dividend: Decimal,
  divisor: Decimal,
  scale: number,
  mode: RoundingMode = DEFAULT_ROUNDING,
): Decimal {
  assertScale(scale);
  if (divisor.isZero()) {
    throw new DomainError('DIVISION_BY_ZERO', 'No se puede dividir entre cero.');
  }
  const shift = Math.max(dividend.decimalPlaces(), divisor.decimalPlaces());
  const numerator = toBigInt(dividend, shift) * 10n ** BigInt(scale);
  const denominator = toBigInt(divisor, shift);

  let quotient = numerator / denominator; // trunca hacia cero
  const remainder = numerator % denominator;
  if (remainder !== 0n) {
    const negative = numerator < 0n !== denominator < 0n;
    const twiceRemainder = abs(remainder) * 2n;
    const absDenominator = abs(denominator);
    const half = twiceRemainder === absDenominator ? 0 : twiceRemainder > absDenominator ? 1 : -1;
    if (roundsAwayFromZero(mode, negative, half, quotient)) {
      quotient += negative ? -1n : 1n;
    }
  }
  return normalizeZero(new Decimal(quotient.toString()).dividedBy(new Decimal(10).pow(scale)));
}

/** Decide si un cociente truncado debe alejarse de cero (hay resto distinto de cero). */
function roundsAwayFromZero(
  mode: RoundingMode,
  negative: boolean,
  half: -1 | 0 | 1,
  truncated: bigint,
): boolean {
  switch (mode) {
    case 'down':
      return false;
    case 'up':
      return true;
    case 'floor':
      return negative;
    case 'ceil':
      return !negative;
    case 'half_up':
      return half >= 0;
    case 'half_even':
      return half > 0 || (half === 0 && truncated % 2n !== 0n);
  }
}

/** Escala un decimal finito a entero exacto: 12.34 con shift 3 → 12340n. */
function toBigInt(value: Decimal, shift: number): bigint {
  const scaled = value.times(new Decimal(10).pow(shift));
  if (!scaled.isInteger() || scaled.precision(true) > 90) {
    // Solo ocurre si se llama con valores fuera de los rangos que valida el motor.
    throw new RangeError('Valor fuera del rango de cálculo exacto del motor.');
  }
  return BigInt(scaled.toFixed(0));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 20) {
    throw new RangeError(`Escala de redondeo inválida: ${String(scale)}`);
  }
}
