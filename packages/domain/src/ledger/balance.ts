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

export interface BalanceOptions {
  /** Fecha de corte del saldo «de hoy» (incluida). La decide quien llama. */
  readonly asOf: LocalDate;
  /**
   * Hasta qué fecha (incluida) se suman los movimientos programados, es decir,
   * los fechados después de `asOf`. Sin valor: todos los registrados.
   */
  readonly projectUntil?: LocalDate;
}

export interface AccountBalance {
  readonly accountId: string;
  readonly currency: string;
  readonly nature: AccountNature;
  readonly asOf: LocalDate;
  readonly opening: Money;
  /**
   * Fecha en que empieza la cuenta cuando es posterior a `asOf`. En ese caso la
   * cuenta todavía no tiene saldo registrado (`current` = 0) y su saldo inicial
   * se suma en `scheduled`. `null` si la cuenta ya empezó.
   */
  readonly startsOn: LocalDate | null;
  /** Saldo inicial + movimientos asentados hasta `asOf`. */
  readonly posted: Money;
  /** Efecto neto de los movimientos pendientes (autorizados sin asentar) hasta `asOf`. */
  readonly pending: Money;
  /** `posted + pending`: en activos, lo que realmente hay hoy; en pasivos, lo que se debe hoy. */
  readonly current: Money;
  /**
   * Efecto neto de lo programado: movimientos fechados después de `asOf` (hasta
   * `projectUntil`) y, si la cuenta empieza después de `asOf`, su saldo inicial.
   */
  readonly scheduled: Money;
  /** `current + scheduled`: lo que quedará después de lo programado («te queda»). */
  readonly projected: Money;
  /** Fecha del último movimiento programado incluido; `null` si no hay nada programado. */
  readonly projectedThrough: LocalDate | null;
  /** Límite de la proyección recibido; `null` = todos los programados. */
  readonly projectUntil: LocalDate | null;
  readonly counted: {
    readonly posted: number;
    readonly pending: number;
    readonly scheduled: number;
  };
  /** Movimientos que no se sumaron y por qué (transparencia del cálculo). */
  readonly excluded: {
    readonly deleted: number;
    readonly void: number;
    /** Fechados antes del saldo inicial: ya están reflejados en él. */
    readonly beforeOpening: number;
    /** Programados después de `projectUntil`. */
    readonly afterProjection: number;
  };
}

/**
 * Saldo de una cuenta a una fecha y lo que quedará después de lo programado,
 * calculados desde el libro (fuente única, §58: el saldo nunca se guarda como
 * un valor independiente).
 *
 * Reglas:
 * - Saldo de hoy (`current`): saldo inicial más los movimientos con fecha
 *   entre `openingBalanceDate` y `asOf`, ambas incluidas.
 * - Programado (`scheduled`): movimientos con fecha posterior a `asOf` (hasta
 *   `projectUntil` si se da). Un movimiento con fecha futura es un compromiso
 *   registrado, no dinero que ya salió: se informa aparte y nunca se mezcla en
 *   el saldo de hoy.
 * - Cuenta que empieza después de `asOf` (saldo inicial futuro, p. ej. el
 *   sueldo que llega el 30): hoy no tiene saldo; su saldo inicial y sus
 *   movimientos van a `scheduled`.
 * - Los movimientos anteriores al saldo inicial se excluyen: el saldo inicial
 *   ya los incluye y sumarlos los contaría dos veces.
 * - Borrados y anulados no cuentan; los pendientes se informan aparte.
 * - `asOf` es obligatorio: «hoy» depende de la zona horaria del usuario y lo
 *   decide quien llama (ver `localDateInTimeZone`).
 */
export function computeAccountBalance(
  account: LedgerAccount,
  entries: readonly LedgerEntry[],
  options: BalanceOptions,
): AccountBalance {
  const opening = validateAccount(account);
  const asOf = assertLocalDate(options.asOf, 'fecha de corte');
  const projectUntil =
    options.projectUntil === undefined
      ? null
      : assertLocalDate(options.projectUntil, 'fin de la proyección');
  if (projectUntil !== null && compareLocalDates(projectUntil, asOf) < 0) {
    throw new DomainError(
      'INVALID_DATE_RANGE',
      'La proyección no puede terminar antes de la fecha de corte.',
      { asOf, projectUntil },
    );
  }
  const nature = accountNature(account.type);
  const zero = Money.zero(account.currency);
  const startsLater = compareLocalDates(account.openingBalanceDate, asOf) > 0;
  const withinProjection = (date: LocalDate) =>
    projectUntil === null || compareLocalDates(date, projectUntil) <= 0;

  let posted = startsLater ? zero : opening;
  let pending = zero;
  let scheduled = zero;
  let projectedThrough: LocalDate | null = null;
  if (startsLater && withinProjection(account.openingBalanceDate)) {
    scheduled = opening;
    projectedThrough = account.openingBalanceDate;
  }
  const counted = { posted: 0, pending: 0, scheduled: 0 };
  const excluded = { deleted: 0, void: 0, beforeOpening: 0, afterProjection: 0 };

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

    const date = entry.transactionDate;
    if (entry.deletedAt !== null) {
      excluded.deleted += 1;
    } else if (entry.status === 'void') {
      excluded.void += 1;
    } else if (compareLocalDates(date, account.openingBalanceDate) < 0) {
      excluded.beforeOpening += 1;
    } else if (compareLocalDates(date, asOf) > 0) {
      if (withinProjection(date)) {
        scheduled = scheduled.plus(balanceEffect(entry, nature));
        counted.scheduled += 1;
        if (projectedThrough === null || compareLocalDates(date, projectedThrough) > 0) {
          projectedThrough = date;
        }
      } else {
        excluded.afterProjection += 1;
      }
    } else if (entry.status === 'pending') {
      pending = pending.plus(balanceEffect(entry, nature));
      counted.pending += 1;
    } else {
      posted = posted.plus(balanceEffect(entry, nature));
      counted.posted += 1;
    }
  }

  const current = posted.plus(pending);
  return {
    accountId: account.id,
    currency: account.currency,
    nature,
    asOf,
    opening,
    startsOn: startsLater ? account.openingBalanceDate : null,
    posted,
    pending,
    current,
    scheduled,
    projected: current.plus(scheduled),
    projectedThrough,
    projectUntil,
    counted,
    excluded,
  };
}

/**
 * Saldos de varias cuentas con las mismas fechas. Cada movimiento debe
 * pertenecer a una de las cuentas recibidas.
 */
export function computeAccountBalances(
  accounts: readonly LedgerAccount[],
  entries: readonly LedgerEntry[],
  options: BalanceOptions,
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
