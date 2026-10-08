import type { accounts, transactions } from '@cf/db';
import { type AccountBalance, Money, accountNature } from '@cf/domain';
import type { AccountDto, MoneyDto, TransactionDto } from '@cf/shared';

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
      posted: balance.posted.toJSON(),
      pending: balance.pending.toJSON(),
      current: balance.current.toJSON(),
      transactionCount: balance.counted.posted + balance.counted.pending,
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
