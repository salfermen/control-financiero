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
 * - Libro: reglas de movimientos, saldos (hoy y después de lo programado),
 *   flujo de caja, posición consolidada, transferencias y reembolsos.
 * - Presupuestos: estado por categoría (con subcategorías), alertas y ritmo.
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
  type BalanceOptions,
  type LedgerAccount,
} from './ledger/balance.js';
export {
  computeCashFlow,
  type CashFlowOptions,
  type CashFlowSummary,
  type CategoryFlow,
  type ScheduledFlow,
} from './ledger/cash-flow.js';
export {
  LIQUID_ACCOUNT_TYPES,
  computeFinancialPosition,
  positionGroup,
  type FinancialPosition,
  type PositionAccount,
  type PositionConversion,
  type PositionGroup,
  type PositionLine,
  type PositionOptions,
  type PositionTotals,
  type UnconvertedAccount,
} from './ledger/position.js';
export {
  BUDGET_LEVELS,
  BUDGET_PERIODS,
  BUDGET_THRESHOLDS,
  MIN_DAYS_FOR_PACE,
  budgetLevel,
  computeBudgetStatuses,
  sortBudgetStatuses,
  type BudgetDefinition,
  type BudgetLevel,
  type BudgetOptions,
  type BudgetPace,
  type BudgetPeriod,
  type BudgetStatus,
  type CategoryNode,
} from './budgets/budget.js';
export { assertValidTransferGroup, type TransferSummary } from './ledger/transfers.js';
export { assertValidRefund, type RefundCheck } from './ledger/refunds.js';
export {
  prepareLedgerAmounts,
  type AccountConversion,
  type LedgerAmounts,
  type LedgerAmountsInput,
} from './ledger/amounts.js';
