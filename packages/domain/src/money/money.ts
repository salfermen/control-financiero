import { getCurrency, isSupportedCurrency } from '../currencies.js';
import { DomainError } from '../errors.js';
import {
  DEFAULT_ROUNDING,
  Decimal,
  type RoundingMode,
  divideToScale,
  normalizeZero,
  parseDecimal,
  roundToScale,
} from './decimal.js';

/** Decimales con los que se guarda todo monto (NUMERIC(20,4), decisión A3). */
export const STORAGE_SCALE = 4;

/** Mayor valor absoluto que cabe en NUMERIC(20,4). */
export const MAX_ABS_AMOUNT = '9999999999999999.9999';
const MAX_ABS = new Decimal(MAX_ABS_AMOUNT);

/** Máximo de partes en un reparto: protege de usos abusivos. */
const MAX_ALLOCATION_PARTS = 10_000;

/** Forma serializable de un monto: así viaja por la API y se guarda. */
export interface MoneyJson {
  /** Decimal con exactamente 4 decimales, p. ej. `"242959.5000"`. */
  readonly amount: string;
  /** Código ISO 4217. */
  readonly currency: string;
}

/** Valor que se acepta como factor o divisor: texto decimal estricto o Decimal interno. */
export type DecimalInput = string | Decimal;

/**
 * Monto de dinero en una moneda. Inmutable.
 *
 * Invariantes (se verifican al crear cualquier instancia):
 * - la moneda está soportada (ISO 4217, registro de `currencies.ts`);
 * - el valor tiene como máximo 4 decimales: todo `Money` se puede guardar tal
 *   cual en la base, sin redondeos implícitos;
 * - el valor absoluto cabe en NUMERIC(20,4).
 *
 * Sumar y restar es exacto. Multiplicar, dividir y convertir exigen un modo
 * de redondeo (por defecto `half_up`) porque el resultado puede tener más
 * decimales. Operar monedas distintas lanza `CURRENCY_MISMATCH`: la conversión
 * siempre es explícita (ver `convert`).
 */
export class Money {
  private constructor(
    private readonly value: Decimal,
    readonly currency: string,
  ) {}

  /** Crea un monto desde texto decimal (`"59.99"`). Rechaza más de 4 decimales en vez de redondear. */
  static of(amount: string, currency: string): Money {
    assertSupportedCurrency(currency);
    const value = parseDecimal(amount, 'INVALID_NUMBER', 'monto');
    if (value.decimalPlaces() > STORAGE_SCALE) {
      throw new DomainError(
        'TOO_MANY_DECIMALS',
        `El monto tiene más de ${STORAGE_SCALE} decimales.`,
        { amount, maxDecimals: STORAGE_SCALE },
      );
    }
    return Money.create(value, currency);
  }

  static zero(currency: string): Money {
    assertSupportedCurrency(currency);
    return new Money(new Decimal(0), currency);
  }

  /**
   * Crea un monto desde un resultado de cálculo interno del motor, con
   * redondeo explícito a 4 decimales.
   * @internal Para módulos de @cf/domain.
   */
  static fromDecimal(
    value: Decimal,
    currency: string,
    mode: RoundingMode = DEFAULT_ROUNDING,
  ): Money {
    assertSupportedCurrency(currency);
    return Money.create(roundToScale(toDecimal(value, 'valor'), STORAGE_SCALE, mode), currency);
  }

  /** Suma una lista; la moneda explícita define el resultado aun si la lista está vacía. */
  static sum(items: readonly Money[], currency: string): Money {
    let total = Money.zero(currency);
    for (const item of items) {
      total = total.plus(item);
    }
    return total;
  }

  private static create(value: Decimal, currency: string): Money {
    if (value.abs().greaterThan(MAX_ABS)) {
      throw new DomainError('AMOUNT_OUT_OF_RANGE', 'El monto supera el máximo admitido.', {
        currency,
        max: MAX_ABS_AMOUNT,
      });
    }
    return new Money(normalizeZero(value), currency);
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this.value.plus(other.value), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this.value.minus(other.value), this.currency);
  }

  negated(): Money {
    return Money.create(this.value.negated(), this.currency);
  }

  abs(): Money {
    return Money.create(this.value.abs(), this.currency);
  }

  /** Multiplica por un factor (porcentaje, cantidad, tasa) y redondea a 4 decimales. */
  times(factor: DecimalInput, mode: RoundingMode = DEFAULT_ROUNDING): Money {
    const product = this.value.times(toDecimal(factor, 'factor'));
    return Money.create(roundToScale(product, STORAGE_SCALE, mode), this.currency);
  }

  /** Divide entre un número y redondea a 4 decimales de forma exacta. */
  dividedBy(divisor: DecimalInput, mode: RoundingMode = DEFAULT_ROUNDING): Money {
    const quotient = divideToScale(this.value, toDecimal(divisor, 'divisor'), STORAGE_SCALE, mode);
    return Money.create(quotient, this.currency);
  }

  /**
   * Proporción `this / other` (misma moneda) como texto decimal, p. ej. `"0.2500"`.
   * Útil para porcentajes de ahorro o de uso de presupuesto.
   */
  ratioTo(other: Money, scale = STORAGE_SCALE, mode: RoundingMode = DEFAULT_ROUNDING): string {
    this.assertSameCurrency(other);
    return divideToScale(this.value, other.value, scale, mode).toFixed(scale);
  }

  /** Redondea a `scale` decimales (0–4), p. ej. a pesos enteros para un pago real. */
  round(scale: number, mode: RoundingMode = DEFAULT_ROUNDING): Money {
    if (!Number.isInteger(scale) || scale < 0 || scale > STORAGE_SCALE) {
      throw new RangeError(`Escala inválida para un monto: ${String(scale)}`);
    }
    return Money.create(roundToScale(this.value, scale, mode), this.currency);
  }

  /** Redondea a los decimales que se muestran al usuario (COP: 0, USD: 2). */
  roundForDisplay(): Money {
    return this.round(getCurrency(this.currency).displayDecimals, 'half_up');
  }

  /**
   * Reparte el monto en partes proporcionales a `weights` sin perder ni crear
   * dinero: la suma de las partes es exactamente el total (método del mayor
   * resto; los empates favorecen a las primeras partes).
   *
   * `scale` es la unidad mínima del reparto; por defecto, los decimales
   * visibles de la moneda (COP en pesos enteros), para que cada parte se vea
   * exacta. Si el monto tiene más decimales que `scale`, se usan los del monto.
   */
  allocate(weights: readonly string[], options: { readonly scale?: number } = {}): Money[] {
    if (weights.length === 0 || weights.length > MAX_ALLOCATION_PARTS) {
      throw new DomainError('INVALID_ALLOCATION', 'El reparto necesita entre 1 y 10.000 partes.', {
        parts: weights.length,
      });
    }
    const requestedScale = options.scale ?? getCurrency(this.currency).displayDecimals;
    if (!Number.isInteger(requestedScale) || requestedScale < 0 || requestedScale > STORAGE_SCALE) {
      throw new DomainError('INVALID_ALLOCATION', 'La escala del reparto debe estar entre 0 y 4.', {
        scale: requestedScale,
      });
    }
    const parsed = weights.map((weight) => {
      const value = parseDecimal(weight, 'INVALID_ALLOCATION', 'peso');
      if (value.isNegative()) {
        throw new DomainError(
          'INVALID_ALLOCATION',
          'Los pesos del reparto no pueden ser negativos.',
        );
      }
      return value;
    });
    const weightShift = Math.max(...parsed.map((w) => w.decimalPlaces()));
    const integerWeights = parsed.map((w) => decimalToBigInt(w, weightShift));
    const totalWeight = integerWeights.reduce((sum, w) => sum + w, 0n);
    if (totalWeight === 0n) {
      throw new DomainError(
        'INVALID_ALLOCATION',
        'Al menos un peso del reparto debe ser mayor que cero.',
      );
    }

    const scale = Math.max(requestedScale, this.value.decimalPlaces());
    const negative = this.value.isNegative();
    const units = decimalToBigInt(this.value.abs(), scale);

    const shares = integerWeights.map((w, index) => ({
      index,
      units: (units * w) / totalWeight,
      remainder: (units * w) % totalWeight,
    }));
    let leftover = units - shares.reduce((sum, s) => sum + s.units, 0n);
    const byRemainder = [...shares].sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
    for (const share of byRemainder) {
      if (leftover === 0n) break;
      share.units += 1n;
      leftover -= 1n;
    }

    const unit = new Decimal(10).pow(scale);
    return shares.map((share) => {
      const amount = new Decimal(share.units.toString()).dividedBy(unit);
      return Money.create(negative ? amount.negated() : amount, this.currency);
    });
  }

  /** Divide en `parts` partes iguales (cuotas), con la misma garantía que `allocate`. */
  splitEvenly(parts: number, options: { readonly scale?: number } = {}): Money[] {
    if (!Number.isInteger(parts) || parts < 1 || parts > MAX_ALLOCATION_PARTS) {
      throw new DomainError(
        'INVALID_ALLOCATION',
        'El número de partes debe ser un entero positivo.',
        {
          parts,
        },
      );
    }
    return this.allocate(
      Array.from({ length: parts }, () => '1'),
      options,
    );
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  /** Igualdad de valor y moneda (`"10"` y `"10.0000"` son iguales). */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  /** Texto decimal con exactamente 4 decimales: el formato de la base y de la API. */
  toAmountString(): string {
    return this.value.toFixed(STORAGE_SCALE);
  }

  /** @internal Para cálculos de alta precisión dentro de @cf/domain. */
  toDecimal(): Decimal {
    return this.value;
  }

  toJSON(): MoneyJson {
    return { amount: this.toAmountString(), currency: this.currency };
  }

  /** Representación técnica para logs (`"59.9900 USD"`). Para la UI usa `formatMoney`. */
  toString(): string {
    return `${this.toAmountString()} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        `No se puede operar ${this.currency} con ${other.currency} sin una conversión explícita.`,
        { left: this.currency, right: other.currency },
      );
    }
  }
}

export function assertSupportedCurrency(currency: string): void {
  if (typeof currency !== 'string' || !isSupportedCurrency(currency)) {
    throw new DomainError('UNSUPPORTED_CURRENCY', 'Moneda no soportada.', {
      currency: typeof currency === 'string' ? currency.slice(0, 8) : typeof currency,
    });
  }
}

function toDecimal(input: DecimalInput, field: string): Decimal {
  if (typeof input === 'string') {
    return parseDecimal(input, 'INVALID_NUMBER', field);
  }
  if (!Decimal.isDecimal(input) || !input.isFinite()) {
    throw new DomainError('INVALID_NUMBER', `${field} no es un número finito.`, { field });
  }
  return new Decimal(input);
}

function decimalToBigInt(value: Decimal, shift: number): bigint {
  return BigInt(value.times(new Decimal(10).pow(shift)).toFixed(0));
}
