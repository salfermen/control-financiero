import { compareLocalDates } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { impliedRate } from '../fx/exchange-rate.js';
import { Money } from '../money/money.js';
import { type LedgerEntry, assertValidLedgerEntry } from './entry.js';

export interface TransferSummary {
  readonly transferGroupId: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  /** Lo que salió, en la moneda de la cuenta de origen. */
  readonly sent: Money;
  /** Lo que llegó, en la moneda de la cuenta de destino. */
  readonly received: Money;
  /** Tasa implícita `received / sent` si las monedas difieren; `null` si son iguales. */
  readonly impliedRate: string | null;
}

/**
 * Valida las dos patas de una transferencia entre cuentas propias (o de un
 * pago de tarjeta/crédito hecho desde otra cuenta propia):
 * - exactamente dos movimientos con el mismo `transferGroupId`;
 * - mismo tipo (`transfer` o `payment`) y mismo estado;
 * - una salida y una entrada, en cuentas distintas;
 * - la entrada no puede ser anterior a la salida;
 * - en la misma moneda, el monto que sale es el que llega.
 *
 * Una transferencia nunca es gasto ni ingreso (ver `computeCashFlow`).
 */
export function assertValidTransferGroup(legs: readonly LedgerEntry[]): TransferSummary {
  const fail = (rule: string, message: string): never => {
    throw new DomainError('INVALID_TRANSFER', message, { rule });
  };

  if (legs.length !== 2) fail('leg_count', 'Una transferencia tiene exactamente dos movimientos.');
  const [first, second] = legs as readonly [LedgerEntry, LedgerEntry];
  assertValidLedgerEntry(first);
  assertValidLedgerEntry(second);

  if (first.transferGroupId === null || first.transferGroupId !== second.transferGroupId) {
    fail('group', 'Las dos patas deben compartir el mismo grupo de transferencia.');
  }
  if (first.type !== second.type || (first.type !== 'transfer' && first.type !== 'payment')) {
    fail('type', 'Las dos patas deben ser del mismo tipo: transferencia o pago.');
  }
  if (first.status !== second.status) {
    fail('status', 'Las dos patas deben tener el mismo estado.');
  }
  if (first.direction === second.direction) {
    fail('directions', 'Una pata debe ser salida y la otra entrada.');
  }
  if (first.accountId === second.accountId) {
    fail('same_account', 'Una transferencia necesita dos cuentas distintas.');
  }

  const outflow = first.direction === 'outflow' ? first : second;
  const inflow = first.direction === 'outflow' ? second : first;
  if (compareLocalDates(inflow.transactionDate, outflow.transactionDate) < 0) {
    fail('inflow_before_outflow', 'El dinero no puede llegar antes de salir.');
  }

  const sent = Money.of(outflow.amount, outflow.accountCurrency);
  const received = Money.of(inflow.amount, inflow.accountCurrency);
  if (sent.currency === received.currency && !sent.equals(received)) {
    fail('amount_mismatch', 'En la misma moneda, lo que sale debe ser igual a lo que llega.');
  }

  return {
    transferGroupId: outflow.transferGroupId as string,
    fromAccountId: outflow.accountId,
    toAccountId: inflow.accountId,
    sent,
    received,
    impliedRate: sent.currency === received.currency ? null : impliedRate(sent, received),
  };
}
