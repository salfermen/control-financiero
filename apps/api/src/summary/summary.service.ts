import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, accounts, transactions } from '@cf/db';
import {
  type PositionAccount,
  type PositionTotals,
  type RateResolution,
  compareLocalDates,
  computeAccountBalance,
  computeCashFlow,
  computeFinancialPosition,
  endOfMonth,
  isWithinRange,
  monthRange,
  yearMonthOf,
} from '@cf/domain';
import type { SummaryDto } from '@cf/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { BudgetsService } from '../budgets/budgets.service.js';
import { AppError } from '../common/errors/app-error.js';
import { DATABASE } from '../database/database.module.js';
import { moneyDto } from '../finance/dto.js';
import { FinanceContextService } from '../finance/finance-context.service.js';
import { ExchangeRatesService, MAX_RATE_STALENESS_DAYS } from '../fx/exchange-rates.service.js';

const UPCOMING_LIMIT = 5;
const TOP_BUDGETS = 5;

type Totals = Record<
  'liquid' | 'investments' | 'liabilities' | 'assets' | 'netWorth',
  PositionTotals
>;

function totalsDto(position: Totals, key: 'today' | 'projected') {
  return {
    liquid: position.liquid[key].toJSON(),
    investments: position.investments[key].toJSON(),
    liabilities: position.liabilities[key].toJSON(),
    assets: position.assets[key].toJSON(),
    netWorth: position.netWorth[key].toJSON(),
  };
}

/**
 * Tablero: «¿cómo estoy?» en una sola respuesta. No calcula nada propio:
 * reúne saldos, posición consolidada, flujo del mes y presupuestos del
 * Financial Engine (fuente única, §58).
 */
@Injectable()
export class SummaryService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly finance: FinanceContextService,
    private readonly rates: ExchangeRatesService,
    private readonly budgets: BudgetsService,
  ) {}

  async get(userId: string): Promise<SummaryDto> {
    const context = await this.finance.load(userId);
    const today = context.today;
    const monthEnd = endOfMonth(today);
    const period = monthRange(yearMonthOf(today));

    const accountRows = await this.database.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), isNull(accounts.deletedAt)));
    const entries = await this.database.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));

    // Saldos de hoy y con lo programado hasta fin de mes, por cuenta.
    const byAccount = new Map(accountRows.map((row) => [row.id, [] as typeof entries]));
    for (const entry of entries) byAccount.get(entry.accountId)?.push(entry);
    const included = accountRows.filter((row) => row.includeInNetWorth);
    let scheduledAfterMonthEnd = 0;
    const positionAccounts: PositionAccount[] = included.map((row) => {
      const balance = computeAccountBalance(row, byAccount.get(row.id) ?? [], {
        asOf: today,
        projectUntil: monthEnd,
      });
      scheduledAfterMonthEnd += balance.excluded.afterProjection;
      return { type: row.type, balance };
    });

    // Tasas de hoy para las monedas distintas de la base (nunca se inventan).
    const rates = new Map<string, RateResolution>();
    for (const currency of new Set(included.map((row) => row.currency))) {
      if (currency === context.baseCurrency) continue;
      rates.set(currency, await this.rates.resolve(currency, context.baseCurrency, today));
    }
    const position = computeFinancialPosition(positionAccounts, {
      baseCurrency: context.baseCurrency,
      asOf: today,
      projectUntil: monthEnd,
      rates,
      maxRateStalenessDays: MAX_RATE_STALENESS_DAYS,
    });
    const names = new Map(accountRows.map((row) => [row.id, row.name]));

    const flow = computeCashFlow(
      entries.filter((entry) => isWithinRange(entry.transactionDate, period)),
      { period, baseCurrency: context.baseCurrency, includePending: true, asOf: today },
    );
    if (!flow.scheduled) throw new AppError('INTERNAL_ERROR', undefined, 'flujo sin programado');

    const budgetStatuses = await this.budgets.statusesFor(context, period);

    const upcoming = entries
      .filter(
        (entry) =>
          entry.status !== 'void' &&
          compareLocalDates(entry.transactionDate, today) > 0 &&
          // De una transferencia o pago entre cuentas propias basta la salida.
          (entry.transferGroupId === null || entry.direction === 'outflow'),
      )
      .sort(
        (a, b) =>
          compareLocalDates(a.transactionDate, b.transactionDate) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .slice(0, UPCOMING_LIMIT);

    return {
      asOf: today,
      monthEnd,
      baseCurrency: context.baseCurrency,
      position: {
        today: totalsDto(position, 'today'),
        endOfMonth: totalsDto(position, 'projected'),
        accounts: position.lines.map((line) => ({
          accountId: line.accountId,
          name: names.get(line.accountId) ?? '',
          type: line.type,
          group: line.group,
          currency: line.currency,
          startsOn: line.startsOn,
          today: line.today.toJSON(),
          endOfMonth: line.projected.toJSON(),
          conversion: line.conversion
            ? {
                rate: line.conversion.appliedRate,
                rateDate: line.conversion.rate.rateDate,
                source: line.conversion.rate.source,
                stale: line.conversion.stale,
                daysOutdated: line.conversion.daysOutdated,
              }
            : null,
        })),
        unconverted: position.unconverted.map((item) => ({
          accountId: item.accountId,
          name: names.get(item.accountId) ?? '',
          currency: item.currency,
          reason: item.reason,
        })),
        excluded: accountRows
          .filter((row) => !row.includeInNetWorth)
          .map((row) => ({ accountId: row.id, name: row.name })),
        estimated: position.estimated,
        scheduledAfterMonthEnd,
      },
      month: {
        period: { from: period.from, to: period.to },
        income: flow.income.toJSON(),
        netExpenses: flow.netExpenses.toJSON(),
        net: flow.net.toJSON(),
        savingsRate: flow.savingsRate,
        scheduled: {
          income: flow.scheduled.income.toJSON(),
          netExpenses: flow.scheduled.netExpenses.toJSON(),
          count: flow.scheduled.count,
        },
      },
      budgets: {
        count: budgetStatuses.length,
        top: budgetStatuses.slice(0, TOP_BUDGETS),
      },
      upcoming: upcoming.map((entry) => ({
        id: entry.id,
        transactionDate: entry.transactionDate,
        description: entry.description,
        type: entry.type,
        direction: entry.direction,
        amount: moneyDto(entry.amount, entry.accountCurrency),
        accountId: entry.accountId,
        accountName: names.get(entry.accountId) ?? '',
        categoryId: entry.categoryId,
      })),
    };
  }
}
