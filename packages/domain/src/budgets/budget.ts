import { type DateRange, createDateRange, isWithinRange } from '../dates/date-range.js';
import {
  assertLocalDate,
  compareLocalDates,
  daysBetween,
  type LocalDate,
} from '../dates/local-date.js';
import { DomainError } from '../errors.js';
import { Money, assertSupportedCurrency } from '../money/money.js';
import type { CategoryKind } from '../categories.js';
import { type LedgerEntry, assertValidLedgerEntry } from '../ledger/entry.js';

/**
 * Umbrales de alerta de un presupuesto (proporción usada del límite):
 * 🟢 normal, 🟡 desde 75 %, 🟠 desde 90 %, 🔴 desde 100 %.
 */
export const BUDGET_THRESHOLDS = {
  notice: '0.75',
  warning: '0.90',
  exceeded: '1',
} as const;

/**
 * Períodos de presupuesto. Hoy solo mensual; semanal y anual se agregarán como
 * valores nuevos del enum (migración aditiva).
 */
export const BUDGET_PERIODS = ['monthly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const BUDGET_LEVELS = ['ok', 'notice', 'warning', 'exceeded'] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

/**
 * Días mínimos transcurridos del período para estimar el cierre al ritmo
 * actual. Antes, una sola compra grande dispararía la extrapolación.
 */
export const MIN_DAYS_FOR_PACE = 7;

/** Lo que el cálculo necesita de una categoría (sistema o personalizada). */
export interface CategoryNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: CategoryKind;
}

export interface BudgetDefinition {
  readonly id: string;
  /** `null` = presupuesto global: todos los gastos, con o sin categoría. */
  readonly categoryId: string | null;
  /** Límite del período, en la moneda base. */
  readonly amount: string;
  readonly currency: string;
}

export interface BudgetOptions {
  /** Período del presupuesto, p. ej. `monthRange('2026-10')`. */
  readonly period: DateRange;
  /** «Hoy» del usuario: separa lo gastado de lo programado. */
  readonly asOf: LocalDate;
  readonly baseCurrency: string;
  /** Todas las categorías visibles para el usuario (para incluir subcategorías). */
  readonly categories: readonly CategoryNode[];
}

export interface BudgetPace {
  /** Gasto estimado al cierre si se mantiene el ritmo de lo gastado hasta hoy. */
  readonly projectedSpend: Money;
  /** `max(projectedSpend, committed)`: lo programado ya está comprometido. */
  readonly projectedClose: Money;
  readonly exceedsLimit: boolean;
  readonly daysElapsed: number;
  readonly daysInPeriod: number;
}

export interface BudgetStatus {
  readonly budgetId: string;
  readonly categoryId: string | null;
  /** La categoría y todas sus subcategorías incluidas (vacío si es global). */
  readonly categoryIds: readonly string[];
  readonly limit: Money;
  /** Gastos netos (gastos + comisiones − reembolsos) con fecha hasta `asOf`, asentados o pendientes. */
  readonly spent: Money;
  /** Gastos netos del período con fecha posterior a `asOf`. */
  readonly scheduled: Money;
  /** `spent + scheduled`. */
  readonly committed: Money;
  /** `limit − committed`; negativo si se pasó. */
  readonly remaining: Money;
  /** `committed / limit` con 4 decimales («0.7500» = 75 %). */
  readonly usedRatio: string;
  /** `spent / limit` con 4 decimales: lo ya gastado, sin lo programado. */
  readonly spentRatio: string;
  /** Nivel de alerta según `usedRatio` y `BUDGET_THRESHOLDS`. */
  readonly level: BudgetLevel;
  /**
   * Estimación al ritmo actual (no es un hecho). `null` si el período no está
   * en curso o han pasado menos de `MIN_DAYS_FOR_PACE` días.
   */
  readonly pace: BudgetPace | null;
  readonly counted: number;
}

const SPENDING_TYPES = new Set(['expense', 'fee', 'refund']);

/**
 * Estado de los presupuestos de un período, desde el libro (fuente única).
 *
 * Reglas:
 * - Cuentan gastos y comisiones; los reembolsos los reducen. Transferencias,
 *   pagos de tarjeta, inversiones e ingresos no son gasto.
 * - Se usan los montos en moneda base guardados en cada movimiento (tasa del
 *   día del movimiento), igual que el flujo de caja.
 * - Un presupuesto de categoría incluye sus subcategorías (Entretenimiento
 *   incluye Videojuegos). El global incluye también los gastos sin categoría.
 * - Pendientes cuentan (un cargo autorizado ya es gasto); anulados y borrados no.
 * - Lo programado (fecha posterior a `asOf`) se informa aparte, pero el nivel
 *   de alerta usa lo comprometido (`spent + scheduled`): avisar antes es más
 *   seguro que avisar tarde.
 */
export function computeBudgetStatuses(
  budgets: readonly BudgetDefinition[],
  entries: readonly LedgerEntry[],
  options: BudgetOptions,
): BudgetStatus[] {
  const period = createDateRange(options.period.from, options.period.to);
  const asOf = assertLocalDate(options.asOf, 'fecha de corte');
  const base = options.baseCurrency;
  assertSupportedCurrency(base);
  const tree = buildCategoryTree(options.categories);

  const scopes = budgets.map((budget) => {
    if (budget.currency !== base) {
      throw new DomainError('CURRENCY_MISMATCH', 'El presupuesto no está en la moneda base.', {
        budgetId: budget.id,
        expected: base,
        received: budget.currency,
      });
    }
    const limit = Money.of(budget.amount, base);
    if (!limit.isPositive()) {
      throw new DomainError('NON_POSITIVE_AMOUNT', 'El límite del presupuesto debe ser positivo.', {
        budgetId: budget.id,
      });
    }
    let categoryIds: readonly string[] = [];
    if (budget.categoryId !== null) {
      const node = tree.get(budget.categoryId);
      if (!node || node.kind !== 'expense') {
        throw new DomainError('INVALID_CATEGORY', 'El presupuesto exige una categoría de gasto.', {
          budgetId: budget.id,
          categoryId: budget.categoryId,
        });
      }
      categoryIds = descendantsOf(tree, budget.categoryId);
    }
    return {
      budget,
      limit,
      categoryIds,
      members: new Set(categoryIds),
      spent: Money.zero(base),
      scheduled: Money.zero(base),
      counted: 0,
    };
  });

  for (const entry of entries) {
    assertValidLedgerEntry(entry);
    if (entry.baseCurrency !== base) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        'El movimiento está expresado en otra moneda base.',
        { entryId: entry.id, expected: base, received: entry.baseCurrency },
      );
    }
    if (
      entry.deletedAt !== null ||
      entry.status === 'void' ||
      !SPENDING_TYPES.has(entry.type) ||
      !isWithinRange(entry.transactionDate, period)
    ) {
      continue;
    }
    const amount = Money.of(entry.baseAmount, base);
    const effect = entry.type === 'refund' ? amount.negated() : amount;
    const isScheduled = compareLocalDates(entry.transactionDate, asOf) > 0;
    for (const scope of scopes) {
      const applies =
        scope.budget.categoryId === null ||
        (entry.categoryId !== null && scope.members.has(entry.categoryId));
      if (!applies) continue;
      if (isScheduled) scope.scheduled = scope.scheduled.plus(effect);
      else scope.spent = scope.spent.plus(effect);
      scope.counted += 1;
    }
  }

  return scopes.map((scope) => {
    const committed = scope.spent.plus(scope.scheduled);
    const usedRatio = committed.ratioTo(scope.limit);
    return {
      budgetId: scope.budget.id,
      categoryId: scope.budget.categoryId,
      categoryIds: scope.categoryIds,
      limit: scope.limit,
      spent: scope.spent,
      scheduled: scope.scheduled,
      committed,
      remaining: scope.limit.minus(committed),
      usedRatio,
      spentRatio: scope.spent.ratioTo(scope.limit),
      level: budgetLevel(committed, scope.limit),
      pace: computePace(scope.spent, committed, scope.limit, period, asOf),
      counted: scope.counted,
    };
  });
}

/**
 * Orden para mostrar: el global primero y luego de mayor a menor uso
 * (comprometido / límite, comparado de forma exacta sin redondear la
 * proporción); empates por id para que el orden sea estable.
 */
export function sortBudgetStatuses(statuses: readonly BudgetStatus[]): BudgetStatus[] {
  return [...statuses].sort((a, b) => {
    if ((a.categoryId === null) !== (b.categoryId === null)) return a.categoryId === null ? -1 : 1;
    // a.committed / a.limit  vs  b.committed / b.limit  ⇔  a.committed · b.limit vs b.committed · a.limit
    const left = a.committed.toDecimal().times(b.limit.toDecimal());
    const right = b.committed.toDecimal().times(a.limit.toDecimal());
    const byUsage = right.comparedTo(left);
    if (byUsage !== 0) return byUsage;
    return a.budgetId < b.budgetId ? -1 : a.budgetId > b.budgetId ? 1 : 0;
  });
}

/** Nivel de alerta de un monto frente a su límite (comparación exacta, sin redondear la proporción). */
export function budgetLevel(used: Money, limit: Money): BudgetLevel {
  if (!limit.isPositive()) {
    throw new DomainError('NON_POSITIVE_AMOUNT', 'El límite del presupuesto debe ser positivo.');
  }
  if (used.greaterThanOrEqual(limit.times(BUDGET_THRESHOLDS.exceeded))) return 'exceeded';
  if (used.greaterThanOrEqual(limit.times(BUDGET_THRESHOLDS.warning, 'up'))) return 'warning';
  if (used.greaterThanOrEqual(limit.times(BUDGET_THRESHOLDS.notice, 'up'))) return 'notice';
  return 'ok';
}

function computePace(
  spent: Money,
  committed: Money,
  limit: Money,
  period: DateRange,
  asOf: LocalDate,
): BudgetPace | null {
  if (!isWithinRange(asOf, period) || asOf === period.to) return null;
  const daysElapsed = daysBetween(period.from, asOf) + 1;
  if (daysElapsed < MIN_DAYS_FOR_PACE) return null;
  const daysInPeriod = daysBetween(period.from, period.to) + 1;
  const projectedSpend = spent.isPositive()
    ? spent.times(String(daysInPeriod)).dividedBy(String(daysElapsed))
    : Money.zero(spent.currency);
  const projectedClose = projectedSpend.greaterThan(committed) ? projectedSpend : committed;
  return {
    projectedSpend,
    projectedClose,
    exceedsLimit: projectedClose.greaterThan(limit),
    daysElapsed,
    daysInPeriod,
  };
}

type CategoryTree = ReadonlyMap<string, CategoryNode & { readonly children: string[] }>;

/** Valida el árbol de categorías: ids únicos, padres existentes del mismo tipo y sin ciclos. */
function buildCategoryTree(categories: readonly CategoryNode[]): CategoryTree {
  const tree = new Map<string, CategoryNode & { children: string[] }>();
  for (const category of categories) {
    if (tree.has(category.id)) {
      throw new DomainError('INVALID_CATEGORY', 'Hay categorías con el mismo id.', {
        categoryId: category.id,
      });
    }
    tree.set(category.id, { ...category, children: [] });
  }
  for (const node of tree.values()) {
    if (node.parentId === null) continue;
    const parent = tree.get(node.parentId);
    if (!parent || parent.kind !== node.kind) {
      throw new DomainError('INVALID_CATEGORY', 'La categoría padre no existe o es de otro tipo.', {
        categoryId: node.id,
      });
    }
    parent.children.push(node.id);
  }
  for (const node of tree.values()) {
    // Subir por los padres: si se vuelve al punto de partida hay un ciclo.
    const visited = new Set<string>([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new DomainError('INVALID_CATEGORY', 'Las categorías forman un ciclo.', {
          categoryId: node.id,
        });
      }
      visited.add(parentId);
      parentId = tree.get(parentId)?.parentId ?? null;
    }
  }
  return tree;
}

/** La categoría y todas sus descendientes, en anchura (el árbol ya está validado: sin ciclos). */
function descendantsOf(tree: CategoryTree, rootId: string): string[] {
  const result = [rootId];
  for (let index = 0; index < result.length; index += 1) {
    const children = tree.get(result[index] ?? '')?.children ?? [];
    result.push(...children);
  }
  return result;
}
