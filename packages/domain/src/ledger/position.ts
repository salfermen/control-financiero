import { assertLocalDate, type LocalDate } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { type ExchangeRate, convert } from '../fx/exchange-rate.js';
import type { RateResolution } from '../fx/rate-resolution.js';
import { Money, assertSupportedCurrency } from '../money/money.js';
import type { AccountBalance } from './balance.js';
import { type AccountType, accountNature } from './constants.js';

/**
 * Cuentas cuyo saldo es dinero disponible para gastar. Las inversiones son
 * activo pero no liquidez, y el cupo de una tarjeta nunca es dinero disponible
 * (§18: una tarjeta es una obligación).
 */
export const LIQUID_ACCOUNT_TYPES = [
  'checking',
  'savings',
  'cash',
  'digital_wallet',
] as const satisfies readonly AccountType[];

export type PositionGroup = 'liquid' | 'investment' | 'liability';

export function positionGroup(type: AccountType): PositionGroup {
  if (accountNature(type) === 'liability') return 'liability';
  return (LIQUID_ACCOUNT_TYPES as readonly AccountType[]).includes(type) ? 'liquid' : 'investment';
}

export interface PositionAccount {
  readonly type: AccountType;
  readonly balance: AccountBalance;
}

export interface PositionOptions {
  readonly baseCurrency: string;
  /** Fecha de corte con la que se calcularon todos los saldos. */
  readonly asOf: LocalDate;
  /** Límite de proyección con el que se calcularon (`null` = todo lo programado). */
  readonly projectUntil: LocalDate | null;
  /**
   * Tasa que rige hoy para cada moneda distinta de la base (clave: código de
   * la moneda), ya resuelta por quien llama con `resolveRateForDate`. El motor
   * no busca ni inventa tasas.
   */
  readonly rates: ReadonlyMap<string, RateResolution>;
  /** Días de atraso que se aceptan en una tasa; si es más vieja, la cuenta queda sin convertir. */
  readonly maxRateStalenessDays: number;
}

export interface PositionTotals {
  /** Con los saldos de hoy. */
  readonly today: Money;
  /** Después de lo programado (hasta el límite de la proyección, si lo hay). */
  readonly projected: Money;
}

export interface PositionConversion {
  readonly rate: ExchangeRate;
  /** Unidades de la moneda base por 1 unidad de la moneda de la cuenta (10 decimales). */
  readonly appliedRate: string;
  /** `true` si la tasa ya no rige hoy (se usó la más reciente disponible). */
  readonly stale: boolean;
  readonly daysOutdated: number;
}

export interface PositionLine {
  readonly accountId: string;
  readonly type: AccountType;
  readonly group: PositionGroup;
  readonly currency: string;
  readonly startsOn: LocalDate | null;
  /** Saldo de hoy en la moneda base (en pasivos: lo que se debe). */
  readonly today: Money;
  /** Saldo después de lo programado, en la moneda base. */
  readonly projected: Money;
  /** Conversión aplicada; `null` si la cuenta ya está en la moneda base. */
  readonly conversion: PositionConversion | null;
}

export interface UnconvertedAccount {
  readonly accountId: string;
  readonly currency: string;
  readonly reason: 'missing_rate' | 'stale_rate';
}

export interface FinancialPosition {
  readonly baseCurrency: string;
  readonly asOf: LocalDate;
  readonly projectUntil: LocalDate | null;
  /** Dinero disponible: cuentas corrientes, de ahorro, efectivo y billeteras. */
  readonly liquid: PositionTotals;
  /** Cuentas de inversión (activo no líquido). */
  readonly investments: PositionTotals;
  /** Lo que se debe en tarjetas y créditos. */
  readonly liabilities: PositionTotals;
  /** `liquid + investments`. */
  readonly assets: PositionTotals;
  /** `assets − liabilities`. */
  readonly netWorth: PositionTotals;
  readonly lines: readonly PositionLine[];
  /** Cuentas que no entran en los totales porque no hay tasa confiable. Nunca se inventa una. */
  readonly unconverted: readonly UnconvertedAccount[];
  /** Cuentas que empiezan después de `asOf`: hoy no aportan saldo. */
  readonly notStarted: readonly string[];
  /** `true` si algún total usa una tasa que ya no rige hoy. */
  readonly estimated: boolean;
}

/**
 * Posición financiera consolidada en la moneda base: disponible, inversiones,
 * deudas y patrimonio neto, hoy y después de lo programado.
 *
 * Reglas:
 * - Todas las cuentas deben calcularse con la misma fecha de corte y el mismo
 *   límite de proyección.
 * - Las cuentas en otra moneda se convierten con la tasa que rige hoy (también
 *   su saldo proyectado: no existe una tasa futura). Si no hay tasa, o es más
 *   vieja que `maxRateStalenessDays`, la cuenta se informa en `unconverted` y no
 *   se suma: un total incompleto y señalado es mejor que uno inventado.
 * - Una tasa vencida pero aceptada marca el resultado como `estimated`.
 */
export function computeFinancialPosition(
  accounts: readonly PositionAccount[],
  options: PositionOptions,
): FinancialPosition {
  const base = options.baseCurrency;
  assertSupportedCurrency(base);
  if (!Number.isInteger(options.maxRateStalenessDays) || options.maxRateStalenessDays < 0) {
    throw new DomainError(
      'INVALID_NUMBER',
      'Los días de atraso aceptados deben ser un entero ≥ 0.',
    );
  }
  const asOf = assertLocalDate(options.asOf, 'fecha de corte');
  const projectUntil =
    options.projectUntil === null
      ? null
      : assertLocalDate(options.projectUntil, 'fin de la proyección');

  const zero = Money.zero(base);
  const totals: Record<PositionGroup, { today: Money; projected: Money }> = {
    liquid: { today: zero, projected: zero },
    investment: { today: zero, projected: zero },
    liability: { today: zero, projected: zero },
  };
  const lines: PositionLine[] = [];
  const unconverted: UnconvertedAccount[] = [];
  const notStarted: string[] = [];
  const seen = new Set<string>();
  let estimated = false;

  for (const { type, balance } of accounts) {
    if (seen.has(balance.accountId)) {
      throw new DomainError('INVALID_ACCOUNT', 'La lista de cuentas tiene ids repetidos.', {
        accountId: balance.accountId,
      });
    }
    seen.add(balance.accountId);
    if (balance.asOf !== asOf || balance.projectUntil !== projectUntil) {
      throw new DomainError(
        'INVALID_DATE_RANGE',
        'Todas las cuentas deben calcularse con la fecha de corte y la proyección indicadas.',
        { accountId: balance.accountId },
      );
    }
    if (balance.nature !== accountNature(type)) {
      throw new DomainError('INVALID_ACCOUNT', 'El tipo no corresponde al saldo calculado.', {
        accountId: balance.accountId,
      });
    }
    if (balance.startsOn !== null) notStarted.push(balance.accountId);

    let conversion: PositionConversion | null = null;
    let today = balance.current;
    let projected = balance.projected;
    if (balance.currency !== base) {
      const resolution = options.rates.get(balance.currency) ?? { status: 'missing' as const };
      if (resolution.status === 'missing') {
        unconverted.push({
          accountId: balance.accountId,
          currency: balance.currency,
          reason: 'missing_rate',
        });
        continue;
      }
      const daysOutdated = resolution.status === 'stale' ? resolution.daysOutdated : 0;
      if (daysOutdated > options.maxRateStalenessDays) {
        unconverted.push({
          accountId: balance.accountId,
          currency: balance.currency,
          reason: 'stale_rate',
        });
        continue;
      }
      const rate = resolution.rate;
      const pair = [rate.baseCurrency, rate.quoteCurrency];
      if (!pair.includes(balance.currency) || !pair.includes(base)) {
        throw new DomainError('RATE_PAIR_MISMATCH', 'La tasa no convierte a la moneda base.', {
          currency: balance.currency,
          pair: `${rate.baseCurrency}/${rate.quoteCurrency}`,
        });
      }
      const todayConversion = convert(today, rate);
      today = todayConversion.to;
      projected = convert(projected, rate).to;
      conversion = {
        rate,
        appliedRate: todayConversion.appliedRate,
        stale: resolution.status === 'stale',
        daysOutdated,
      };
      if (conversion.stale) estimated = true;
    }

    const group = positionGroup(type);
    totals[group].today = totals[group].today.plus(today);
    totals[group].projected = totals[group].projected.plus(projected);
    lines.push({
      accountId: balance.accountId,
      type,
      group,
      currency: balance.currency,
      startsOn: balance.startsOn,
      today,
      projected,
      conversion,
    });
  }

  const assets = {
    today: totals.liquid.today.plus(totals.investment.today),
    projected: totals.liquid.projected.plus(totals.investment.projected),
  };
  return {
    baseCurrency: base,
    asOf,
    projectUntil,
    liquid: totals.liquid,
    investments: totals.investment,
    liabilities: totals.liability,
    assets,
    netWorth: {
      today: assets.today.minus(totals.liability.today),
      projected: assets.projected.minus(totals.liability.projected),
    },
    lines,
    unconverted,
    notStarted,
    estimated,
  };
}
