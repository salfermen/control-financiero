import type { accounts, transactions } from '@cf/db';
import { type AccountBalance, type BudgetStatus, Money, accountNature } from '@cf/domain';
import type { AccountDto, BudgetStatusDto, MoneyDto, TransactionDto } from '@cf/shared';

type AccountRow = typeof accounts.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

/** Fuente usada cuando la persona escribe el valor que realmente cobró el banco. */
export const SETTLED_FX_SOURCE = 'settled';
/** Fuente usada cuando la persona escribe la tasa que aplicó su banco. */
export const MANUAL_FX_SOURCE = 'manual';

export function moneyDto(amount: string, currency: string): MoneyDto {
  return Money.of(amount, currency).toJSON();
}

export function accountToDto(row: AccountRow, balance: AccountBalance): AccountDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    nature: accountNature(row.type),
    status: row.status,
    institutionName: row.institutionName,
    currency: row.currency,
    openingBalance: moneyDto(row.openingBalance, row.currency),
    openingBalanceDate: row.openingBalanceDate,
    includeInNetWorth: row.includeInNetWorth,
    notes: row.notes,
    source: row.source,
    balance: {
      asOf: balance.asOf,
      startsOn: balance.startsOn,
      posted: balance.posted.toJSON(),
      pending: balance.pending.toJSON(),
      current: balance.current.toJSON(),
      scheduled: balance.scheduled.toJSON(),
      projected: balance.projected.toJSON(),
      projectedThrough: balance.projectedThrough,
      transactionCount: balance.counted.posted + balance.counted.pending,
      scheduledCount: balance.counted.scheduled,
      excludedBeforeOpening: balance.excluded.beforeOpening,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

export function transactionToDto(
  row: TransactionRow,
  counterpartAccountId: string | null = null,
): TransactionDto {
  const hasFx = row.accountFxRate !== null || row.baseFxRate !== null;
  const sources = (row.fxSource ?? '').split(' + ');
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type,
    direction: row.direction,
    status: row.status,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    description: row.description,
    merchantName: row.merchantName,
    categoryId: row.categoryId,
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    amount: moneyDto(row.amount, row.accountCurrency),
    original: moneyDto(row.originalAmount, row.originalCurrency),
    base: moneyDto(row.baseAmount, row.baseCurrency),
    fx:
      hasFx && row.fxSource !== null && row.fxConvertedAt !== null
        ? {
            accountRate: row.accountFxRate,
            baseRate: row.baseFxRate,
            source: row.fxSource,
            convertedAt: row.fxConvertedAt.toISOString(),
            estimated: sources.some((source) => source !== SETTLED_FX_SOURCE),
          }
        : null,
    transferGroupId: row.transferGroupId,
    counterpartAccountId,
    refundOfId: row.refundOfId,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Datos de la versión del presupuesto que acompañan al cálculo del motor. */
export interface BudgetVersionInfo {
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly categoryName: string | null;
}

export function budgetStatusToDto(status: BudgetStatus, info: BudgetVersionInfo): BudgetStatusDto {
  return {
    id: status.budgetId,
    categoryId: status.categoryId,
    categoryName: info.categoryName,
    subcategoryCount: Math.max(status.categoryIds.length - 1, 0),
    validFrom: info.validFrom,
    validTo: info.validTo,
    limit: status.limit.toJSON(),
    spent: status.spent.toJSON(),
    scheduled: status.scheduled.toJSON(),
    committed: status.committed.toJSON(),
    remaining: status.remaining.toJSON(),
    usedRatio: status.usedRatio,
    spentRatio: status.spentRatio,
    level: status.level,
    pace: status.pace
      ? {
          projectedSpend: status.pace.projectedSpend.toJSON(),
          projectedClose: status.pace.projectedClose.toJSON(),
          exceedsLimit: status.pace.exceedsLimit,
          daysElapsed: status.pace.daysElapsed,
          daysInPeriod: status.pace.daysInPeriod,
        }
      : null,
    transactionCount: status.counted,
  };
}
