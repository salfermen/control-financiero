import { compareLocalDates } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { Money } from '../money/money.js';
import { type LedgerEntry, assertValidLedgerEntry, isActiveEntry } from './entry.js';

export interface RefundCheck {
  /** Total reembolsado del original, incluido este reembolso, en la moneda original. */
  readonly refundedTotal: Money;
  /** Lo que aún se podría reembolsar. */
  readonly remaining: Money;
}

/**
 * Valida un reembolso contra el gasto original y los reembolsos previos:
 * - el reembolso apunta al original (`refundOfId`) y el original es un gasto
 *   o una comisión vigente (no anulado ni borrado);
 * - no es anterior al gasto;
 * - está en la misma moneda original (el comercio devuelve lo que cobró);
 * - la suma de reembolsos no supera el monto original.
 *
 * Se compara en la moneda original y no en la de la cuenta, porque con
 * compras en otra moneda la tasa del día del reembolso suele ser distinta.
 */
export function assertValidRefund(
  refund: LedgerEntry,
  original: LedgerEntry,
  previousRefunds: readonly LedgerEntry[] = [],
): RefundCheck {
  const fail = (rule: string, message: string): never => {
    throw new DomainError('INVALID_REFUND', message, { rule, refundId: refund.id });
  };

  assertValidLedgerEntry(refund);
  assertValidLedgerEntry(original);
  if (refund.type !== 'refund' || refund.refundOfId !== original.id) {
    fail('link', 'El reembolso debe apuntar al movimiento original.');
  }
  if (original.type !== 'expense' && original.type !== 'fee') {
    fail('original_type', 'Solo se reembolsan gastos o comisiones.');
  }
  if (!isActiveEntry(original)) {
    fail('original_inactive', 'El movimiento original está anulado o borrado.');
  }
  if (compareLocalDates(refund.transactionDate, original.transactionDate) < 0) {
    fail('before_original', 'El reembolso no puede ser anterior al gasto.');
  }
  if (refund.originalCurrency !== original.originalCurrency) {
    fail('currency', 'El reembolso debe estar en la moneda original del gasto.');
  }

  const originalAmount = Money.of(original.originalAmount, original.originalCurrency);
  let refundedTotal = Money.of(refund.originalAmount, refund.originalCurrency);
  for (const previous of previousRefunds) {
    if (previous.id === refund.id || !isActiveEntry(previous)) continue;
    assertValidLedgerEntry(previous);
    if (previous.type !== 'refund' || previous.refundOfId !== original.id) {
      fail('previous_link', 'Un reembolso previo no corresponde a este gasto.');
    }
    if (previous.originalCurrency !== original.originalCurrency) {
      fail('currency', 'Un reembolso previo está en otra moneda.');
    }
    refundedTotal = refundedTotal.plus(
      Money.of(previous.originalAmount, previous.originalCurrency),
    );
  }
  if (refundedTotal.greaterThan(originalAmount)) {
    fail('exceeds_original', 'Los reembolsos superan el monto del gasto original.');
  }
  return { refundedTotal, remaining: originalAmount.minus(refundedTotal) };
}
