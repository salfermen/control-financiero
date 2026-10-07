import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  currencyCode,
  deletedAt,
  fxRate,
  instant,
  money,
  primaryId,
  sha256Hex,
  updatedAt,
} from './columns.js';
import {
  accountStatusEnum,
  accountTypeEnum,
  paymentMethodEnum,
  recordSourceEnum,
  syncStatusEnum,
  transactionDirectionEnum,
  transactionStatusEnum,
  transactionTypeEnum,
} from './enums.js';
import { exchangeRates } from './fx.js';
import { users } from './identity.js';
import { categories, currencies } from './reference.js';

/**
 * Cuentas del usuario: activos (corriente, ahorros, efectivo, billetera,
 * inversión) y pasivos (tarjeta de crédito, préstamo).
 *
 * Convención de `opening_balance`: en cuentas de activo, positivo = dinero que
 * se tiene; en cuentas de pasivo, positivo = dinero que se debe.
 *
 * El saldo NO se guarda aquí: se calcula como saldo inicial + movimientos
 * (fuente única, §58). Las conciliaciones con el banco irán en
 * `account_balance_snapshots` (F4).
 */
export const accounts = pgTable(
  'accounts',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    type: accountTypeEnum('type').notNull(),
    status: accountStatusEnum('status').notNull().default('active'),
    institutionName: varchar('institution_name', { length: 80 }),
    currency: currencyCode('currency')
      .notNull()
      .references(() => currencies.code),
    openingBalance: money('opening_balance').notNull().default('0'),
    openingBalanceDate: date('opening_balance_date', { mode: 'string' }).notNull(),
    includeInNetWorth: boolean('include_in_net_worth').notNull().default(true),
    source: recordSourceEnum('source').notNull().default('manual'),
    externalId: varchar('external_id', { length: 128 }),
    lastSyncedAt: instant('last_synced_at'),
    syncStatus: syncStatusEnum('sync_status'),
    notes: varchar('notes', { length: 2000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('accounts_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('accounts_source_valid', sql`${t.source} IN ('manual', 'import', 'bank')`),
    // Destino de la FK compuesta de transactions: garantiza a nivel de base de datos
    // que un movimiento pertenece al mismo usuario y usa la moneda de su cuenta.
    unique('accounts_id_user_currency_uq').on(t.id, t.userId, t.currency),
    uniqueIndex('accounts_user_source_external_uq').on(t.userId, t.source, t.externalId),
    index('accounts_user_active_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/**
 * Libro único de movimientos (fuente de verdad de ingresos y gastos).
 *
 * - `amount` siempre positivo; el sentido lo dan `type` y `direction`.
 * - Tres montos: el original (lo que cobró el comercio), el de la cuenta (lo que
 *   afectó el saldo) y el de la moneda base (para reportes). El original nunca se
 *   sobrescribe.
 * - Una transferencia entre cuentas propias son dos filas con el mismo
 *   `transfer_group_id` y NO cuenta como gasto ni ingreso.
 * - `transaction_date` es una fecha contable sin hora (evita el corrimiento de
 *   día por zona horaria).
 */
export const transactions = pgTable(
  'transactions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    accountCurrency: currencyCode('account_currency').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    type: transactionTypeEnum('type').notNull(),
    direction: transactionDirectionEnum('direction').notNull(),
    status: transactionStatusEnum('status').notNull().default('posted'),
    transactionDate: date('transaction_date', { mode: 'string' }).notNull(),
    postedDate: date('posted_date', { mode: 'string' }),
    description: varchar('description', { length: 255 }).notNull(),
    merchantName: varchar('merchant_name', { length: 120 }),
    paymentMethod: paymentMethodEnum('payment_method'),

    // Monto en la moneda de la cuenta: es el que mueve el saldo.
    amount: money('amount').notNull(),
    // Monto y moneda originales del comercio o de la fuente.
    originalAmount: money('original_amount').notNull(),
    originalCurrency: currencyCode('original_currency')
      .notNull()
      .references(() => currencies.code),
    accountFxRate: fxRate('account_fx_rate'),
    // Monto en la moneda base del usuario (reportes y patrimonio).
    baseCurrency: currencyCode('base_currency')
      .notNull()
      .references(() => currencies.code),
    baseAmount: money('base_amount').notNull(),
    baseFxRate: fxRate('base_fx_rate'),
    fxRateId: uuid('fx_rate_id').references(() => exchangeRates.id),
    fxSource: varchar('fx_source', { length: 60 }),
    fxConvertedAt: instant('fx_converted_at'),

    transferGroupId: uuid('transfer_group_id'),
    refundOfId: uuid('refund_of_id').references((): AnyPgColumn => transactions.id),

    source: recordSourceEnum('source').notNull().default('manual'),
    externalId: varchar('external_id', { length: 128 }),
    importFingerprint: sha256Hex('import_fingerprint'),
    lastSyncedAt: instant('last_synced_at'),
    syncStatus: syncStatusEnum('sync_status'),
    notes: varchar('notes', { length: 2000 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    foreignKey({
      name: 'transactions_account_fk',
      columns: [t.accountId, t.userId, t.accountCurrency],
      foreignColumns: [accounts.id, accounts.userId, accounts.currency],
    }),
    check('transactions_amount_positive', sql`${t.amount} > 0`),
    check('transactions_original_amount_positive', sql`${t.originalAmount} > 0`),
    check('transactions_base_amount_positive', sql`${t.baseAmount} > 0`),
    check(
      'transactions_account_conversion_consistent',
      sql`(${t.originalCurrency} = ${t.accountCurrency} AND ${t.accountFxRate} IS NULL AND ${t.amount} = ${t.originalAmount})
        OR (${t.originalCurrency} <> ${t.accountCurrency} AND ${t.accountFxRate} IS NOT NULL AND ${t.accountFxRate} > 0)`,
    ),
    check(
      'transactions_base_conversion_consistent',
      sql`(${t.originalCurrency} = ${t.baseCurrency} AND ${t.baseFxRate} IS NULL AND ${t.baseAmount} = ${t.originalAmount})
        OR (${t.originalCurrency} <> ${t.baseCurrency} AND ${t.baseFxRate} IS NOT NULL AND ${t.baseFxRate} > 0)`,
    ),
    check(
      'transactions_conversion_traceable',
      sql`(${t.accountFxRate} IS NULL AND ${t.baseFxRate} IS NULL)
        OR (${t.fxSource} IS NOT NULL AND ${t.fxConvertedAt} IS NOT NULL)`,
    ),
    check(
      'transactions_direction_matches_type',
      sql`(${t.type} IN ('income', 'refund') AND ${t.direction} = 'inflow')
        OR (${t.type} IN ('expense', 'fee') AND ${t.direction} = 'outflow')
        OR ${t.type} IN ('transfer', 'payment', 'investment')`,
    ),
    check(
      'transactions_transfer_group_rules',
      sql`(${t.type} = 'transfer' AND ${t.transferGroupId} IS NOT NULL)
        OR ${t.type} IN ('payment', 'investment')
        OR (${t.type} IN ('income', 'expense', 'refund', 'fee') AND ${t.transferGroupId} IS NULL)`,
    ),
    check(
      'transactions_transfer_without_category',
      sql`${t.type} <> 'transfer' OR ${t.categoryId} IS NULL`,
    ),
    check(
      'transactions_refund_link_only_on_refund',
      sql`${t.refundOfId} IS NULL OR ${t.type} = 'refund'`,
    ),
    check(
      'transactions_posted_after_transaction',
      sql`${t.postedDate} IS NULL OR ${t.postedDate} >= ${t.transactionDate}`,
    ),
    check('transactions_description_not_blank', sql`length(btrim(${t.description})) > 0`),
    uniqueIndex('transactions_user_source_external_uq').on(t.userId, t.source, t.externalId),
    index('transactions_user_date_idx')
      .on(t.userId, t.transactionDate.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index('transactions_account_date_idx').on(t.accountId, t.transactionDate),
    index('transactions_user_category_date_idx').on(t.userId, t.categoryId, t.transactionDate),
    index('transactions_transfer_group_idx').on(t.transferGroupId),
    index('transactions_user_fingerprint_idx').on(t.userId, t.importFingerprint),
  ],
);
