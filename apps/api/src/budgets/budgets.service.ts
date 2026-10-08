import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, budgets, transactions } from '@cf/db';
import {
  BUDGET_THRESHOLDS,
  type DateRange,
  Money,
  addDays,
  compareLocalDates,
  computeBudgetStatuses,
  monthRange,
  sortBudgetStatuses,
  yearMonthOf,
} from '@cf/domain';
import type {
  BudgetStatusDto,
  BudgetsMonthDto,
  createBudgetRequestSchema,
  updateBudgetRequestSchema,
} from '@cf/shared';
import { and, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { budgetStatusToDto } from '../finance/dto.js';
import {
  type Executor,
  type FinanceContext,
  FinanceContextService,
} from '../finance/finance-context.service.js';

type CreateInput = z.output<typeof createBudgetRequestSchema>;
type UpdateInput = z.output<typeof updateBudgetRequestSchema>;
type BudgetRow = typeof budgets.$inferSelect;

const invalid = (path: string, message: string): AppError =>
  new AppError('VALIDATION_ERROR', [{ path, message }]);

function isExclusionViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } }).cause ?? error;
  return (cause as { code?: unknown }).code === '23P01';
}

/**
 * Presupuestos mensuales con vigencia. El estado (gastado, programado, nivel
 * de alerta, ritmo) lo calcula el Financial Engine desde el libro; aquí solo se
 * guardan límites y se gestionan sus versiones sin reescribir meses pasados.
 */
@Injectable()
export class BudgetsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly finance: FinanceContextService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  async month(userId: string, month: string | undefined): Promise<BudgetsMonthDto> {
    const context = await this.finance.load(userId);
    const yearMonth = month ?? yearMonthOf(context.today);
    const statuses = await this.statusesFor(context, monthRange(yearMonth));
    return {
      month: yearMonth,
      period: monthRange(yearMonth),
      asOf: context.today,
      baseCurrency: context.baseCurrency,
      thresholds: { ...BUDGET_THRESHOLDS },
      budgets: statuses,
    };
  }

  /** Estado de los presupuestos vigentes en un período, ordenados para mostrar. */
  async statusesFor(
    context: FinanceContext,
    period: DateRange,
    executor: Executor = this.database.db,
  ): Promise<BudgetStatusDto[]> {
    const versions = await executor
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, context.userId),
          isNull(budgets.deletedAt),
          lte(budgets.validFrom, period.from),
          or(isNull(budgets.validTo), gte(budgets.validTo, period.to)),
        ),
      );
    if (versions.length === 0) return [];
    const all = await this.categories.all(context.userId, executor);
    const entries = await executor
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, context.userId),
          isNull(transactions.deletedAt),
          inArray(transactions.type, ['expense', 'fee', 'refund']),
          gte(transactions.transactionDate, period.from),
          lte(transactions.transactionDate, period.to),
        ),
      );
    const statuses = computeBudgetStatuses(
      versions.map((v) => ({
        id: v.id,
        categoryId: v.categoryId,
        amount: v.amount,
        currency: v.currency,
      })),
      entries,
      {
        period,
        asOf: context.today,
        baseCurrency: context.baseCurrency,
        categories: CategoriesService.toNodes(all),
      },
    );
    const byId = new Map(versions.map((v) => [v.id, v]));
    const names = new Map(all.map((c) => [c.id, c.deleted ? `${c.name} (eliminada)` : c.name]));
    return sortBudgetStatuses(statuses).map((status) => {
      const version = byId.get(status.budgetId) as BudgetRow;
      return budgetStatusToDto(status, {
        validFrom: version.validFrom,
        validTo: version.validTo,
        categoryName: status.categoryId === null ? null : (names.get(status.categoryId) ?? null),
      });
    });
  }

  async create(
    userId: string,
    input: CreateInput,
    requestContext: RequestContext,
  ): Promise<BudgetStatusDto> {
    const context = await this.finance.load(userId);
    const startMonth = input.startMonth ?? yearMonthOf(context.today);
    const period = monthRange(startMonth);
    // Valida rango y decimales con el motor antes de guardar.
    Money.of(input.amount, context.baseCurrency);

    const id = await this.database.db.transaction(async (tx) => {
      if (input.categoryId !== null) {
        const all = await this.categories.all(userId, tx);
        const category = all.find((c) => c.id === input.categoryId && !c.deleted);
        if (!category) throw invalid('categoryId', 'Elige una categoría válida.');
        if (category.kind !== 'expense') {
          throw invalid('categoryId', 'Los presupuestos se definen sobre categorías de gasto.');
        }
      }
      const [overlapping] = await tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(
          and(
            this.sameScope(userId, input.categoryId),
            or(isNull(budgets.validTo), gte(budgets.validTo, period.from)),
          ),
        )
        .limit(1);
      if (overlapping) throw new AppError('BUDGET_EXISTS');

      let created: BudgetRow | undefined;
      try {
        [created] = await tx
          .insert(budgets)
          .values({
            userId,
            categoryId: input.categoryId,
            amount: input.amount,
            currency: context.baseCurrency,
            validFrom: period.from,
          })
          .returning();
      } catch (error) {
        if (isExclusionViolation(error)) throw new AppError('BUDGET_EXISTS');
        throw error;
      }
      if (!created) throw new AppError('INTERNAL_ERROR', undefined, 'insert sin filas');
      await this.audit.record(
        {
          action: 'budget_created',
          userId,
          entityType: 'budget',
          entityId: created.id,
          metadata: { global: created.categoryId === null, validFrom: created.validFrom },
          context: requestContext,
        },
        tx,
      );
      return created.id;
    });
    return this.statusOf(context, period, id);
  }

  /**
   * Cambia el límite desde `fromMonth`. Si la versión empezó antes, se cierra
   * al final del mes anterior y se abre una nueva: los meses pasados conservan
   * su límite (§52).
   */
  async update(
    userId: string,
    id: string,
    input: UpdateInput,
    requestContext: RequestContext,
  ): Promise<BudgetStatusDto> {
    const context = await this.finance.load(userId);
    const period = monthRange(input.fromMonth ?? yearMonthOf(context.today));
    const resultId = await this.database.db.transaction(async (tx) => {
      const version = await this.findOwned(tx, userId, id);
      Money.of(input.amount, version.currency);
      this.assertCovers(version, period, 'fromMonth');

      let targetId = version.id;
      if (version.validFrom === period.from) {
        await tx
          .update(budgets)
          .set({ amount: input.amount })
          .where(and(eq(budgets.id, version.id), eq(budgets.userId, userId)));
      } else {
        await tx
          .update(budgets)
          .set({ validTo: addDays(period.from, -1) })
          .where(and(eq(budgets.id, version.id), eq(budgets.userId, userId)));
        const [next] = await tx
          .insert(budgets)
          .values({
            userId,
            categoryId: version.categoryId,
            amount: input.amount,
            currency: version.currency,
            validFrom: period.from,
            validTo: version.validTo,
          })
          .returning({ id: budgets.id });
        if (!next) throw new AppError('INTERNAL_ERROR', undefined, 'insert sin filas');
        targetId = next.id;
      }
      await this.audit.record(
        {
          action: 'budget_changed',
          userId,
          entityType: 'budget',
          entityId: targetId,
          metadata: { fromMonth: period.from, previousVersion: version.id, split: targetId !== id },
          context: requestContext,
        },
        tx,
      );
      return targetId;
    });
    return this.statusOf(context, period, resultId);
  }

  /**
   * Deja de presupuestar desde `fromMonth`. Si la versión empezó antes, se
   * cierra al final del mes anterior (el historial se conserva); si empieza
   * ese mes o después, se elimina (borrado lógico).
   */
  async remove(
    userId: string,
    id: string,
    fromMonth: string | undefined,
    requestContext: RequestContext,
  ): Promise<void> {
    const context = await this.finance.load(userId);
    const period = monthRange(fromMonth ?? yearMonthOf(context.today));
    await this.database.db.transaction(async (tx) => {
      const version = await this.findOwned(tx, userId, id);
      if (version.validTo !== null && compareLocalDates(version.validTo, period.from) < 0) {
        throw new AppError('RULE_VIOLATION', [
          { path: 'fromMonth', message: 'Ese presupuesto ya había terminado antes de ese mes.' },
        ]);
      }
      const ended = compareLocalDates(version.validFrom, period.from) < 0;
      await tx
        .update(budgets)
        .set(ended ? { validTo: addDays(period.from, -1) } : { deletedAt: context.now })
        .where(and(eq(budgets.id, version.id), eq(budgets.userId, userId)));
      await this.audit.record(
        {
          action: 'budget_deleted',
          userId,
          entityType: 'budget',
          entityId: id,
          metadata: { fromMonth: period.from, mode: ended ? 'ended' : 'deleted' },
          context: requestContext,
        },
        tx,
      );
    });
  }

  private async statusOf(
    context: FinanceContext,
    period: DateRange,
    id: string,
  ): Promise<BudgetStatusDto> {
    const statuses = await this.statusesFor(context, period);
    const status = statuses.find((s) => s.id === id);
    if (!status) throw new AppError('INTERNAL_ERROR', undefined, `presupuesto ${id} sin estado`);
    return status;
  }

  private async findOwned(tx: Executor, userId: string, id: string): Promise<BudgetRow> {
    const [row] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId), isNull(budgets.deletedAt)))
      .limit(1)
      .for('update');
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  private assertCovers(version: BudgetRow, period: DateRange, path: string): void {
    const covers =
      compareLocalDates(version.validFrom, period.from) <= 0 &&
      (version.validTo === null || compareLocalDates(version.validTo, period.to) >= 0);
    if (!covers) {
      throw new AppError('RULE_VIOLATION', [
        { path, message: 'Ese presupuesto no rige en el mes indicado.' },
      ]);
    }
  }

  /** Mismo usuario y misma categoría (o global), sin borrar. */
  private sameScope(userId: string, categoryId: string | null): SQL | undefined {
    return and(
      eq(budgets.userId, userId),
      isNull(budgets.deletedAt),
      categoryId === null ? isNull(budgets.categoryId) : eq(budgets.categoryId, categoryId),
    );
  }
}
