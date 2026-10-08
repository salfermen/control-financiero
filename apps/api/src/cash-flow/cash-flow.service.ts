import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, transactions } from '@cf/db';
import { computeCashFlow, monthRange, yearMonthOf } from '@cf/domain';
import type { CashFlowDto } from '@cf/shared';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { AppError } from '../common/errors/app-error.js';
import { DATABASE } from '../database/database.module.js';
import { FinanceContextService } from '../finance/finance-context.service.js';

/** Flujo de caja de un mes en la moneda base, calculado por el Financial Engine. */
@Injectable()
export class CashFlowService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly finance: FinanceContextService,
  ) {}

  async month(
    userId: string,
    month: string | undefined,
    includePending: boolean,
  ): Promise<CashFlowDto> {
    const context = await this.finance.load(userId);
    const period = monthRange(month ?? yearMonthOf(context.today));
    const rows = await this.database.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          gte(transactions.transactionDate, period.from),
          lte(transactions.transactionDate, period.to),
        ),
      );
    const flow = computeCashFlow(rows, {
      period,
      baseCurrency: context.baseCurrency,
      includePending,
      asOf: context.today,
    });
    // Con `asOf` el motor siempre separa la parte programada.
    const { scheduled } = flow;
    if (!scheduled) throw new AppError('INTERNAL_ERROR', undefined, 'flujo sin parte programada');
    return {
      period: { from: flow.period.from, to: flow.period.to },
      baseCurrency: flow.baseCurrency,
      includePending: flow.includePending,
      income: flow.income.toJSON(),
      expenses: flow.expenses.toJSON(),
      fees: flow.fees.toJSON(),
      refunds: flow.refunds.toJSON(),
      netExpenses: flow.netExpenses.toJSON(),
      net: flow.net.toJSON(),
      savingsRate: flow.savingsRate,
      byCategory: flow.byCategory.map((category) => ({
        categoryId: category.categoryId,
        kind: category.kind,
        gross: category.gross.toJSON(),
        refunds: category.refunds.toJSON(),
        net: category.net.toJSON(),
        count: category.count,
      })),
      scheduled: {
        asOf: scheduled.asOf,
        income: scheduled.income.toJSON(),
        netExpenses: scheduled.netExpenses.toJSON(),
        count: scheduled.count,
      },
      counted: { ...flow.counted },
      excluded: { ...flow.excluded },
    };
  }
}
