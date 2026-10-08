import { DomainError } from '../errors.js';
import { type Conversion, type ExchangeRate, convert, impliedRate } from '../fx/exchange-rate.js';
import { DEFAULT_ROUNDING, type RoundingMode } from '../money/decimal.js';
import { Money, assertSupportedCurrency } from '../money/money.js';

/** Cómo se obtiene el monto en la moneda de la cuenta cuando difiere de la original. */
export type AccountConversion =
  /** Con una tasa publicada (TRM, proveedor, tasa manual con su fuente). */
  | { readonly kind: 'rate'; readonly rate: ExchangeRate }
  /**
   * Con el valor real que cobró el banco (extracto o sincronización). Ese
   * valor manda (decisión 4 de la auditoría) y la tasa se deduce de él.
   */
  | { readonly kind: 'settled'; readonly amount: string; readonly source: string };

export interface LedgerAmountsInput {
  /** Lo que cobró el comercio o la fuente, en su moneda. Debe ser positivo. */
  readonly original: Money;
  readonly accountCurrency: string;
  readonly baseCurrency: string;
  /** Obligatoria si la moneda original difiere de la de la cuenta; prohibida si no. */
  readonly accountConversion?: AccountConversion;
  /**
   * Tasa para llevar a la moneda base cuando ni la moneda original ni la de la
   * cuenta son la base. Puede ser del par original↔base o cuenta↔base (útil
   * cuando solo existe la tasa contra el dólar).
   */
  readonly baseRate?: ExchangeRate;
  /** Momento de la conversión (se guarda en `fx_converted_at`). */
  readonly convertedAt: Date;
  readonly rounding?: RoundingMode;
}

/** Columnas multimoneda de `transactions`, listas para insertar. */
export interface LedgerAmounts {
  readonly originalAmount: string;
  readonly originalCurrency: string;
  readonly amount: string;
  readonly accountCurrency: string;
  readonly accountFxRate: string | null;
  readonly baseAmount: string;
  readonly baseCurrency: string;
  readonly baseFxRate: string | null;
  /** Fuentes usadas; si hubo dos distintas se unen con « + ». */
  readonly fxSource: string | null;
  readonly fxConvertedAt: Date | null;
  /** Id de `exchange_rates` si se usó exactamente una tasa guardada. */
  readonly fxRateId: string | null;
}

const MAX_SOURCE_LENGTH = 60;

/**
 * Calcula los tres montos de un movimiento (original, cuenta y base) y sus
 * tasas, cumpliendo las reglas del libro:
 * - el monto original nunca se modifica;
 * - misma moneda → sin tasa y mismo monto;
 * - moneda distinta → tasa positiva con fuente y fecha;
 * - ningún monto puede redondear a 0.
 *
 * El motor no consulta tasas: si falta una, lanza `MISSING_EXCHANGE_RATE` y
 * quien llama decide (pedirla al proveedor o al usuario). Nunca se inventa.
 */
export function prepareLedgerAmounts(input: LedgerAmountsInput): LedgerAmounts {
  const { original, accountCurrency, baseCurrency } = input;
  const mode = input.rounding ?? DEFAULT_ROUNDING;
  assertSupportedCurrency(accountCurrency);
  assertSupportedCurrency(baseCurrency);
  if (!original.isPositive()) {
    throw new DomainError('NON_POSITIVE_AMOUNT', 'El monto original debe ser mayor que cero.');
  }
  if (!(input.convertedAt instanceof Date) || Number.isNaN(input.convertedAt.getTime())) {
    throw new DomainError('INVALID_DATE', 'La fecha de conversión no es válida.');
  }

  const sources: string[] = [];
  const ratesUsed: ExchangeRate[] = [];

  // 1. Moneda de la cuenta.
  let amount = original;
  let accountFxRate: string | null = null;
  if (original.currency === accountCurrency) {
    if (input.accountConversion) {
      throw unexpected('La moneda original ya es la de la cuenta.');
    }
  } else {
    const conversion = input.accountConversion;
    if (!conversion) {
      throw new DomainError(
        'MISSING_EXCHANGE_RATE',
        'Falta la tasa hacia la moneda de la cuenta.',
        {
          from: original.currency,
          to: accountCurrency,
        },
      );
    }
    if (conversion.kind === 'rate') {
      const result = expectCurrency(convert(original, conversion.rate, mode), accountCurrency);
      amount = result.to;
      accountFxRate = result.appliedRate;
      sources.push(conversion.rate.source);
      ratesUsed.push(conversion.rate);
    } else {
      amount = Money.of(conversion.amount, accountCurrency);
      if (!amount.isPositive()) {
        throw new DomainError('NON_POSITIVE_AMOUNT', 'El monto cobrado debe ser mayor que cero.');
      }
      accountFxRate = impliedRate(original, amount);
      sources.push(requireSource(conversion.source));
    }
    assertNotRoundedToZero(amount);
  }

  // 2. Moneda base.
  let baseAmount = original;
  let baseFxRate: string | null = null;
  if (original.currency === baseCurrency) {
    if (input.baseRate) throw unexpected('La moneda original ya es la base.');
  } else if (accountCurrency === baseCurrency) {
    // La base es la moneda de la cuenta: se reutiliza esa misma conversión.
    if (input.baseRate) throw unexpected('La moneda de la cuenta ya es la base.');
    baseAmount = amount;
    baseFxRate = accountFxRate;
  } else {
    const rate = input.baseRate;
    if (!rate) {
      throw new DomainError('MISSING_EXCHANGE_RATE', 'Falta la tasa hacia la moneda base.', {
        from: original.currency,
        to: baseCurrency,
      });
    }
    const pair = [rate.baseCurrency, rate.quoteCurrency];
    if (pair.includes(original.currency) && pair.includes(baseCurrency)) {
      const result = expectCurrency(convert(original, rate, mode), baseCurrency);
      baseAmount = result.to;
      baseFxRate = result.appliedRate;
    } else if (pair.includes(accountCurrency) && pair.includes(baseCurrency)) {
      // Cadena original → cuenta → base; la tasa guardada es la efectiva original → base.
      baseAmount = expectCurrency(convert(amount, rate, mode), baseCurrency).to;
      assertNotRoundedToZero(baseAmount);
      baseFxRate = impliedRate(original, baseAmount);
    } else {
      throw new DomainError('RATE_PAIR_MISMATCH', 'La tasa base no sirve para esta conversión.', {
        pair: `${rate.baseCurrency}/${rate.quoteCurrency}`,
      });
    }
    sources.push(rate.source);
    ratesUsed.push(rate);
    assertNotRoundedToZero(baseAmount);
  }

  const uniqueSources = [...new Set(sources)];
  const fxSource = uniqueSources.length === 0 ? null : uniqueSources.join(' + ');
  if (fxSource !== null && fxSource.length > MAX_SOURCE_LENGTH) {
    throw new DomainError(
      'INVALID_RATE',
      'La descripción de las fuentes de la tasa es demasiado larga.',
    );
  }
  const uniqueRates = [...new Set(ratesUsed)];
  return {
    originalAmount: original.toAmountString(),
    originalCurrency: original.currency,
    amount: amount.toAmountString(),
    accountCurrency,
    accountFxRate,
    baseAmount: baseAmount.toAmountString(),
    baseCurrency,
    baseFxRate,
    fxSource,
    fxConvertedAt: fxSource === null ? null : input.convertedAt,
    fxRateId:
      uniqueRates.length === 1 && sources.length === 1 ? (uniqueRates[0]?.id ?? null) : null,
  };
}

function expectCurrency(conversion: Conversion, currency: string): Conversion {
  if (conversion.to.currency !== currency) {
    throw new DomainError('RATE_PAIR_MISMATCH', 'La tasa no lleva a la moneda esperada.', {
      expected: currency,
      received: conversion.to.currency,
    });
  }
  return conversion;
}

function assertNotRoundedToZero(amount: Money): void {
  if (!amount.isPositive()) {
    throw new DomainError(
      'AMOUNT_ROUNDS_TO_ZERO',
      'La conversión da 0 al redondear a 4 decimales; el libro exige montos positivos.',
      { currency: amount.currency },
    );
  }
}

function requireSource(source: string): string {
  const trimmed = typeof source === 'string' ? source.trim() : '';
  if (trimmed.length === 0 || trimmed.length > MAX_SOURCE_LENGTH) {
    throw new DomainError(
      'INVALID_RATE',
      'El monto liquidado debe indicar su fuente (máx. 60 caracteres).',
    );
  }
  return trimmed;
}

function unexpected(message: string): DomainError {
  return new DomainError('UNEXPECTED_CONVERSION', `${message} No se debe enviar una conversión.`);
}
