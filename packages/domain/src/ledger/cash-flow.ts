import { type DateRange, createDateRange, isWithinRange } from '../dates/date-range.js';
import { assertLocalDate, compareLocalDates, type LocalDate } from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { Money, assertSupportedCurrency } from '../money/money.js';
import type { TransactionType } from './constants.js';
import { type LedgerEntry, assertValidLedgerEntry } from './entry.js';

export interface CashFlowOptions {
  /** Período contable (inclusivo), p. ej. `monthRange('2026-10')`. */
  readonly period: DateRange;
  /** Moneda base del usuario; todo el flujo se expresa en ella. */
  readonly baseCurrency: string;
  /**
   * Si `true`, los movimientos pendientes cuentan (un cargo autorizado ya es
   * gasto comprometido). Si `false`, solo los asentados. Siempre se informa
   * cuántos pendientes hubo.
   */
  readonly includePending: boolean;
  /**
   * «Hoy» del usuario. Si se da, el resultado separa en `scheduled` la parte
   * del período con fecha posterior (programada). Los totales siguen cubriendo
   * todo el período.
   */
  readonly asOf?: LocalDate;
}

/** Parte programada del período: movimientos con fecha posterior a `asOf`. */
export interface ScheduledFlow {
  readonly asOf: LocalDate;
  readonly income: Money;
  /** Gastos + comisiones − reembolsos programados. */
  readonly netExpenses: Money;
  readonly count: number;
}

export interface CategoryFlow {
  readonly categoryId: string | null;
  readonly kind: 'income' | 'expense';
  /** Ingresos, o gastos + comisiones, de la categoría. */
  readonly gross: Money;
  /** Reembolsos recibidos en la categoría (solo gastos). */
  readonly refunds: Money;
  /** `gross − refunds`. Puede ser negativo si llega un reembolso de un gasto de otro período. */
  readonly net: Money;
  readonly count: number;
}

export interface CashFlowSummary {
  readonly period: DateRange;
  readonly baseCurrency: string;
  readonly includePending: boolean;
  readonly income: Money;
  /** Gastos brutos (tipo `expense`). */
  readonly expenses: Money;
  /** Comisiones y cargos bancarios (tipo `fee`). */
  readonly fees: Money;
  /** Reembolsos (reducen el gasto; no son ingreso). */
  readonly refunds: Money;
  /** `expenses + fees − refunds`. */
  readonly netExpenses: Money;
  /** `income − netExpenses`: lo que quedó (o faltó) en el período. */
  readonly net: Money;
  /** `net / income` con 4 decimales (`"0.2500"` = 25 %); `null` si no hubo ingresos. */
  readonly savingsRate: string | null;
  /** Ingresos primero y luego gastos; dentro de cada grupo, de mayor a menor neto. */
  readonly byCategory: readonly CategoryFlow[];
  /** Solo si se pidió `asOf`: cuánto de los totales está programado (aún no ocurre). */
  readonly scheduled: ScheduledFlow | null;
  readonly counted: Readonly<Record<'income' | 'expense' | 'fee' | 'refund', number>>;
  /** Lo que no entró en el cálculo y por qué. */
  readonly excluded: {
    /** Transferencias entre cuentas propias: mover dinero no es gastarlo. */
    readonly transfer: number;
    /** Abonos a tarjetas o créditos: el gasto ya se contó al comprar. */
    readonly payment: number;
    /** Aportes y retiros de inversiones. */
    readonly investment: number;
    readonly void: number;
    readonly deleted: number;
    /** Pendientes no incluidos (solo si `includePending` es `false`). */
    readonly pending: number;
    readonly outsidePeriod: number;
  };
}

const NEUTRAL_TYPES: ReadonlySet<TransactionType> = new Set(['transfer', 'payment', 'investment']);

/**
 * Flujo de caja de un período, en la moneda base y con los montos base
 * guardados en cada movimiento (convertidos con la tasa del día del
 * movimiento: el pasado no cambia si la tasa cambia hoy).
 *
 * Clasificación:
 * - Ingreso: `income`. Gasto: `expense` y `fee`. Reembolso: resta del gasto.
 * - Transferencias, pagos de tarjeta/crédito e inversiones no son ingreso ni
 *   gasto; se cuentan en `excluded` para que el resultado sea explicable.
 */
export function computeCashFlow(
  entries: readonly LedgerEntry[],
  options: CashFlowOptions,
): CashFlowSummary {
  const period = createDateRange(options.period.from, options.period.to);
  const currency = options.baseCurrency;
  assertSupportedCurrency(currency);
  const asOf = options.asOf === undefined ? null : assertLocalDate(options.asOf, 'fecha de corte');

  const zero = Money.zero(currency);
  let income = zero;
  let expenses = zero;
  let fees = zero;
  let refunds = zero;
  const counted = { income: 0, expense: 0, fee: 0, refund: 0 };
  const excluded = {
    transfer: 0,
    payment: 0,
    investment: 0,
    void: 0,
    deleted: 0,
    pending: 0,
    outsidePeriod: 0,
  };
  const categories = new Map<string, MutableCategoryFlow>();
  let scheduledIncome = zero;
  let scheduledExpenses = zero;
  let scheduledCount = 0;

  for (const entry of entries) {
    assertValidLedgerEntry(entry);
    if (entry.baseCurrency !== currency) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        'El movimiento está expresado en otra moneda base.',
        { entryId: entry.id, expected: currency, received: entry.baseCurrency },
      );
    }
    if (entry.deletedAt !== null) {
      excluded.deleted += 1;
      continue;
    }
    if (entry.status === 'void') {
      excluded.void += 1;
      continue;
    }
    if (!isWithinRange(entry.transactionDate, period)) {
      excluded.outsidePeriod += 1;
      continue;
    }
    if (entry.status === 'pending' && !options.includePending) {
      excluded.pending += 1;
      continue;
    }
    if (NEUTRAL_TYPES.has(entry.type)) {
      excluded[entry.type as 'transfer' | 'payment' | 'investment'] += 1;
      continue;
    }

    const amount = Money.of(entry.baseAmount, currency);
    if (asOf !== null && compareLocalDates(entry.transactionDate, asOf) > 0) {
      scheduledCount += 1;
      if (entry.type === 'income') scheduledIncome = scheduledIncome.plus(amount);
      else if (entry.type === 'refund') scheduledExpenses = scheduledExpenses.minus(amount);
      else scheduledExpenses = scheduledExpenses.plus(amount);
    }
    switch (entry.type) {
      case 'income':
        income = income.plus(amount);
        counted.income += 1;
        addToCategory(categories, entry.categoryId, 'income', amount, 'gross', currency);
        break;
      case 'expense':
        expenses = expenses.plus(amount);
        counted.expense += 1;
        addToCategory(categories, entry.categoryId, 'expense', amount, 'gross', currency);
        break;
      case 'fee':
        fees = fees.plus(amount);
        counted.fee += 1;
        addToCategory(categories, entry.categoryId, 'expense', amount, 'gross', currency);
        break;
      default:
        // Único tipo restante: 'refund' (los neutrales se filtraron arriba).
        refunds = refunds.plus(amount);
        counted.refund += 1;
        addToCategory(categories, entry.categoryId, 'expense', amount, 'refunds', currency);
    }
  }

  const netExpenses = expenses.plus(fees).minus(refunds);
  const net = income.minus(netExpenses);
  return {
    period,
    baseCurrency: currency,
    includePending: options.includePending,
    income,
    expenses,
    fees,
    refunds,
    netExpenses,
    net,
    savingsRate: income.isPositive() ? net.ratioTo(income) : null,
    byCategory: sortCategories([...categories.values()]),
    scheduled:
      asOf === null
        ? null
        : {
            asOf,
            income: scheduledIncome,
            netExpenses: scheduledExpenses,
            count: scheduledCount,
          },
    counted,
    excluded,
  };
}

interface MutableCategoryFlow {
  categoryId: string | null;
  kind: 'income' | 'expense';
  gross: Money;
  refunds: Money;
  count: number;
}

function addToCategory(
  categories: Map<string, MutableCategoryFlow>,
  categoryId: string | null,
  kind: 'income' | 'expense',
  amount: Money,
  bucket: 'gross' | 'refunds',
  currency: string,
): void {
  const key = `${kind}:${categoryId ?? ''}`;
  let flow = categories.get(key);
  if (!flow) {
    flow = {
      categoryId,
      kind,
      gross: Money.zero(currency),
      refunds: Money.zero(currency),
      count: 0,
    };
    categories.set(key, flow);
  }
  flow[bucket] = flow[bucket].plus(amount);
  flow.count += 1;
}

function sortCategories(flows: MutableCategoryFlow[]): CategoryFlow[] {
  return flows
    .map((flow) => ({ ...flow, net: flow.gross.minus(flow.refunds) }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'income' ? -1 : 1;
      const byNet = b.net.compare(a.net);
      if (byNet !== 0) return byNet;
      // Desempate estable: sin categoría al final, luego por id.
      if (a.categoryId === b.categoryId) return 0;
      if (a.categoryId === null) return 1;
      if (b.categoryId === null) return -1;
      return a.categoryId < b.categoryId ? -1 : 1;
    });
}
