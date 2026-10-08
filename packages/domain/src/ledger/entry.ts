import { compareLocalDates, parseLocalDate, type LocalDate } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { Decimal, parseDecimal } from '../money/decimal.js';
import { Money } from '../money/money.js';
import {
  type AccountNature,
  REQUIRED_DIRECTION,
  type TransactionDirection,
  type TransactionStatus,
  type TransactionType,
  isTransactionDirection,
  isTransactionStatus,
  isTransactionType,
} from './constants.js';

/**
 * Movimiento del libro tal como lo guarda la tabla `transactions` (los
 * nombres coinciden con las columnas de Drizzle, así que una fila se pasa
 * directo al motor). Los montos son texto decimal y siempre positivos: el
 * sentido lo dan `type` y `direction`.
 */
export interface LedgerEntry {
  readonly id: string;
  readonly accountId: string;
  /** Moneda de la cuenta; `amount` está en esta moneda. */
  readonly accountCurrency: string;
  readonly type: TransactionType;
  readonly direction: TransactionDirection;
  readonly status: TransactionStatus;
  readonly transactionDate: LocalDate;
  readonly postedDate: LocalDate | null;
  /** Monto en la moneda de la cuenta: el que mueve el saldo. */
  readonly amount: string;
  readonly originalAmount: string;
  readonly originalCurrency: string;
  /** Unidades de moneda de la cuenta por 1 unidad de la moneda original. */
  readonly accountFxRate: string | null;
  /** Monto en la moneda base del usuario, convertido el día del movimiento. */
  readonly baseAmount: string;
  readonly baseCurrency: string;
  /** Unidades de moneda base por 1 unidad de la moneda original. */
  readonly baseFxRate: string | null;
  readonly fxSource: string | null;
  readonly fxConvertedAt: Date | string | null;
  readonly categoryId: string | null;
  readonly transferGroupId: string | null;
  readonly refundOfId: string | null;
  readonly deletedAt: Date | string | null;
}

/**
 * Verifica que un movimiento cumpla las reglas del libro. Son las mismas que
 * imponen los CHECK de PostgreSQL (docs/DATABASE.md): validarlas aquí permite
 * dar errores claros antes de escribir y protege los cálculos si alguna fila
 * llegara por otra vía. Lanza `INVALID_LEDGER_ENTRY` con `details.rule`.
 */
export function assertValidLedgerEntry(entry: LedgerEntry): void {
  const fail = (rule: string, message: string): never => {
    throw new DomainError('INVALID_LEDGER_ENTRY', message, { rule, entryId: entry.id });
  };

  if (!isTransactionType(entry.type)) fail('type', 'Tipo de movimiento desconocido.');
  if (!isTransactionDirection(entry.direction)) fail('direction', 'Dirección desconocida.');
  if (!isTransactionStatus(entry.status)) fail('status', 'Estado desconocido.');

  parseLocalDate(entry.transactionDate, 'fecha del movimiento');
  if (entry.postedDate !== null) {
    parseLocalDate(entry.postedDate, 'fecha de asiento');
    if (compareLocalDates(entry.postedDate, entry.transactionDate) < 0) {
      fail('posted_after_transaction', 'La fecha de asiento es anterior a la del movimiento.');
    }
  }

  const amount = Money.of(entry.amount, entry.accountCurrency);
  const original = Money.of(entry.originalAmount, entry.originalCurrency);
  const base = Money.of(entry.baseAmount, entry.baseCurrency);
  if (!amount.isPositive() || !original.isPositive() || !base.isPositive()) {
    fail('amount_positive', 'Los montos del libro deben ser mayores que cero.');
  }

  checkConversion(
    entry.originalCurrency === entry.accountCurrency,
    entry.accountFxRate,
    original,
    amount,
    'account_conversion',
    fail,
  );
  checkConversion(
    entry.originalCurrency === entry.baseCurrency,
    entry.baseFxRate,
    original,
    base,
    'base_conversion',
    fail,
  );
  if (
    (entry.accountFxRate !== null || entry.baseFxRate !== null) &&
    (entry.fxSource === null || entry.fxConvertedAt === null)
  ) {
    fail('conversion_traceable', 'Toda conversión debe registrar su fuente y su fecha.');
  }

  const requiredDirection = REQUIRED_DIRECTION[entry.type];
  if (requiredDirection !== null && entry.direction !== requiredDirection) {
    fail('direction_matches_type', `Un movimiento ${entry.type} debe ser ${requiredDirection}.`);
  }

  if (entry.type === 'transfer' && entry.transferGroupId === null) {
    fail('transfer_group', 'Una transferencia necesita su grupo de transferencia.');
  }
  if (
    ['income', 'expense', 'refund', 'fee'].includes(entry.type) &&
    entry.transferGroupId !== null
  ) {
    fail('transfer_group', `Un movimiento ${entry.type} no puede pertenecer a una transferencia.`);
  }
  if (entry.type === 'transfer' && entry.categoryId !== null) {
    fail('transfer_without_category', 'Una transferencia no lleva categoría.');
  }
  if (entry.refundOfId !== null && entry.type !== 'refund') {
    fail('refund_link', 'Solo un reembolso puede apuntar al movimiento original.');
  }
}

function checkConversion(
  sameCurrency: boolean,
  rate: string | null,
  original: Money,
  converted: Money,
  rule: string,
  fail: (rule: string, message: string) => never,
): void {
  if (sameCurrency) {
    if (rate !== null) fail(rule, 'Sin cambio de moneda no debe haber tasa.');
    if (!original.toDecimal().equals(converted.toDecimal())) {
      fail(rule, 'Sin cambio de moneda, los montos deben ser iguales.');
    }
    return;
  }
  if (rate === null) fail(rule, 'Con cambio de moneda la tasa es obligatoria.');
  const value = parseDecimal(rate, 'INVALID_RATE', 'tasa');
  if (value.lessThanOrEqualTo(new Decimal(0))) fail(rule, 'La tasa debe ser mayor que cero.');
}

/** Un movimiento afecta saldos y flujos solo si no está borrado ni anulado. */
export function isActiveEntry(entry: Pick<LedgerEntry, 'status' | 'deletedAt'>): boolean {
  return entry.deletedAt === null && entry.status !== 'void';
}

/**
 * Efecto del movimiento sobre el saldo de su cuenta, en la moneda de la cuenta.
 * - Activo (dinero que se tiene): entrada suma, salida resta.
 * - Pasivo (dinero que se debe): una compra con tarjeta (salida) aumenta la
 *   deuda; un abono (entrada) la reduce.
 */
export function balanceEffect(entry: LedgerEntry, nature: AccountNature): Money {
  const amount = Money.of(entry.amount, entry.accountCurrency);
  const increases =
    nature === 'asset' ? entry.direction === 'inflow' : entry.direction === 'outflow';
  return increases ? amount : amount.negated();
}
