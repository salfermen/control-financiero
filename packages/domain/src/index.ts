/**
 * @cf/domain — núcleo de dominio sin IO y Financial Engine.
 *
 * Fuente única de los cálculos financieros (§9 y §58 de AGENTS.md): las apps
 * no suman, convierten ni redondean dinero por su cuenta; usan estas funciones.
 *
 * - Referencia: monedas ISO 4217 y categorías del sistema.
 * - Dinero: `Money` (decimal exacto, 4 decimales), redondeo explícito, reparto
 *   sin pérdidas y formato para la UI.
 * - Tasas: `ExchangeRate` con procedencia y `convert` en ambos sentidos.
 * - Fechas contables `YYYY-MM-DD` sin corrimientos de zona horaria.
 * - Libro: reglas de movimientos, saldos, flujo de caja, transferencias y
 *   reembolsos.
 *
 * La aritmética decimal interna (decimal.js) no se exporta a propósito.
 */
export * from './currencies.js';
export * from './categories.js';
export * from './errors.js';

export { ROUNDING_MODES, DEFAULT_ROUNDING, type RoundingMode } from './money/decimal.js';
export {
  Money,
  STORAGE_SCALE,
  MAX_ABS_AMOUNT,
  assertSupportedCurrency,
  type MoneyJson,
  type DecimalInput,
} from './money/money.js';
export { formatMoney, formatPercent, formatRate, type FormatMoneyOptions } from './money/format.js';
export { parseAmountInput, type ParseAmountOptions } from './money/input.js';

export {
  RATE_SCALE,
  createExchangeRate,
  convert,
  impliedRate,
  type ExchangeRate,
  type ExchangeRateInput,
  type Conversion,
} from './fx/exchange-rate.js';
export {
  rateVariation,
  resolveRateForDate,
  type RateResolution,
  type RateVariation,
} from './fx/rate-resolution.js';

export * from './dates/local-date.js';
export * from './dates/date-range.js';

export * from './ledger/constants.js';
export {
  assertValidLedgerEntry,
  balanceEffect,
  isActiveEntry,
  type LedgerEntry,
} from './ledger/entry.js';
export {
  computeAccountBalance,
  computeAccountBalances,
  type AccountBalance,
  type LedgerAccount,
} from './ledger/balance.js';
export {
  computeCashFlow,
  type CashFlowOptions,
  type CashFlowSummary,
  type CategoryFlow,
} from './ledger/cash-flow.js';
export { assertValidTransferGroup, type TransferSummary } from './ledger/transfers.js';
export { assertValidRefund, type RefundCheck } from './ledger/refunds.js';
export {
  prepareLedgerAmounts,
  type AccountConversion,
  type LedgerAmounts,
  type LedgerAmountsInput,
} from './ledger/amounts.js';
