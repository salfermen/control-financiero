import { assertLocalDate, compareLocalDates, type LocalDate } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { Money } from '../money/money.js';
import { type AccountNature, type AccountType, accountNature, isAccountType } from './constants.js';
import { type LedgerEntry, assertValidLedgerEntry, balanceEffect } from './entry.js';

/** Datos de la cuenta que necesita el cálculo de saldo (columnas de `accounts`). */
export interface LedgerAccount {
  readonly id: string;
  readonly type: AccountType;
  readonly currency: string;
  /**
   * Saldo al inicio del día `openingBalanceDate`. En activos, positivo = dinero
   * que se tiene; en pasivos, positivo = dinero que se debe.
   */
  readonly openingBalance: string;
  readonly openingBalanceDate: LocalDate;
}

export interface AccountBalance {
  readonly accountId: string;
  readonly currency: string;
  readonly nature: AccountNature;
  readonly asOf: LocalDate;
  readonly opening: Money;
  /** Saldo inicial + movimientos asentados hasta `asOf`. */
  readonly posted: Money;
  /** Efecto neto de los movimientos pendientes (autorizados sin asentar). */
  readonly pending: Money;
  /** `posted + pending`: en activos, lo que realmente queda; en pasivos, lo que se debe incluyendo cargos pendientes. */
  readonly current: Money;
  readonly counted: { readonly posted: number; readonly pending: number };
  /** Movimientos que no se sumaron y por qué (transparencia del cálculo). */
  readonly excluded: {
    readonly deleted: number;
    readonly void: number;
    /** Fechados antes del saldo inicial: ya están reflejados en él. */
    readonly beforeOpening: number;
    /** Fechados después de `asOf` (p. ej. movimientos futuros). */
    readonly afterAsOf: number;
  };
}

/**
 * Saldo de una cuenta a una fecha, calculado desde el libro (fuente única, §58:
 * el saldo nunca se guarda como un valor independiente).
 *
 * Reglas:
 * - Cuenta el saldo inicial más los movimientos con fecha entre
 *   `openingBalanceDate` y `asOf`, ambas incluidas.
 * - Los movimientos anteriores al saldo inicial se excluyen: el saldo inicial
 *   ya los incluye y sumarlos los contaría dos veces.
 * - Borrados y anulados no cuentan; los pendientes se informan aparte.
 * - `asOf` es obligatorio: «hoy» depende de la zona horaria del usuario y lo
 *   decide quien llama (ver `localDateInTimeZone`).
 */
export function computeAccountBalance(
  account: LedgerAccount,
  entries: readonly LedgerEntry[],
  options: { readonly asOf: LocalDate },
): AccountBalance {
  const opening = validateAccount(account);
  const asOf = assertLocalDate(options.asOf, 'fecha de corte');
  if (compareLocalDates(asOf, account.openingBalanceDate) < 0) {
    throw new DomainError(
      'DATE_BEFORE_OPENING_BALANCE',
      'No hay saldo calculable antes de la fecha del saldo inicial.',
      { accountId: account.id, asOf, openingBalanceDate: account.openingBalanceDate },
    );
  }
  const nature = accountNature(account.type);

  let posted = opening;
  let pending = Money.zero(account.currency);
  const counted = { posted: 0, pending: 0 };
  const excluded = { deleted: 0, void: 0, beforeOpening: 0, afterAsOf: 0 };

  for (const entry of entries) {
    if (entry.accountId !== account.id) {
      throw new DomainError('ACCOUNT_MISMATCH', 'El movimiento no pertenece a la cuenta.', {
        accountId: account.id,
        entryId: entry.id,
      });
    }
    if (entry.accountCurrency !== account.currency) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        'El movimiento no está en la moneda de la cuenta.',
        {
          accountId: account.id,
          entryId: entry.id,
        },
      );
    }
    assertValidLedgerEntry(entry);

    if (entry.deletedAt !== null) {
      excluded.deleted += 1;
    } else if (entry.status === 'void') {
      excluded.void += 1;
    } else if (compareLocalDates(entry.transactionDate, asOf) > 0) {
      excluded.afterAsOf += 1;
    } else if (compareLocalDates(entry.transactionDate, account.openingBalanceDate) < 0) {
      excluded.beforeOpening += 1;
    } else if (entry.status === 'pending') {
      pending = pending.plus(balanceEffect(entry, nature));
      counted.pending += 1;
    } else {
      posted = posted.plus(balanceEffect(entry, nature));
      counted.posted += 1;
    }
  }

  return {
    accountId: account.id,
    currency: account.currency,
    nature,
    asOf,
    opening,
    posted,
    pending,
    current: posted.plus(pending),
    counted,
    excluded,
  };
}

/**
 * Saldos de varias cuentas a la misma fecha. Cada movimiento debe pertenecer a
 * una de las cuentas recibidas.
 */
export function computeAccountBalances(
  accounts: readonly LedgerAccount[],
  entries: readonly LedgerEntry[],
  options: { readonly asOf: LocalDate },
): AccountBalance[] {
  const byAccount = new Map<string, LedgerEntry[]>(accounts.map((a) => [a.id, []]));
  if (byAccount.size !== accounts.length) {
    throw new DomainError('INVALID_ACCOUNT', 'La lista de cuentas tiene ids repetidos.');
  }
  for (const entry of entries) {
    const bucket = byAccount.get(entry.accountId);
    if (!bucket) {
      throw new DomainError('ACCOUNT_MISMATCH', 'Hay movimientos de una cuenta no incluida.', {
        entryId: entry.id,
        accountId: entry.accountId,
      });
    }
    bucket.push(entry);
  }
  return accounts.map((account) =>
    computeAccountBalance(account, byAccount.get(account.id) ?? [], options),
  );
}

function validateAccount(account: LedgerAccount): Money {
  if (!isAccountType(account.type)) {
    throw new DomainError('INVALID_ACCOUNT', 'Tipo de cuenta desconocido.', {
      accountId: account.id,
    });
  }
  assertLocalDate(account.openingBalanceDate, 'fecha del saldo inicial');
  return Money.of(account.openingBalance, account.currency);
}
