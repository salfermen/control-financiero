/**
 * Vocabulario del libro de movimientos. Fuente única: los enums de PostgreSQL
 * (`@cf/db`) se generan a partir de estas listas, así que el motor y la base
 * nunca pueden discrepar.
 */

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'cash',
  'digital_wallet',
  'investment',
  'credit_card',
  'loan',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Cuentas que representan una obligación (pasivo), no dinero disponible. */
export const LIABILITY_ACCOUNT_TYPES = [
  'credit_card',
  'loan',
] as const satisfies readonly AccountType[];

export type AccountNature = 'asset' | 'liability';

export const ACCOUNT_STATUSES = ['active', 'closed'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Tipos de movimiento:
 * - `income` / `expense`: ingreso y gasto reales.
 * - `refund`: devolución de un gasto; reduce el gasto, no es ingreso.
 * - `fee`: comisión o cargo bancario; cuenta como gasto.
 * - `transfer`: entre cuentas propias (dos patas con el mismo grupo); no es gasto ni ingreso.
 * - `payment`: abono a una tarjeta o crédito; no es gasto (el gasto se contó al comprar).
 * - `investment`: aporte o retiro de inversiones; no es gasto ni ingreso.
 */
export const TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer',
  'refund',
  'payment',
  'fee',
  'investment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_DIRECTIONS = ['inflow', 'outflow'] as const;
export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

/** `pending`: autorizado sin asentar; `posted`: asentado; `void`: anulado (no cuenta). */
export const TRANSACTION_STATUSES = ['pending', 'posted', 'void'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = [
  'cash',
  'debit_card',
  'credit_card',
  'bank_transfer',
  'digital_wallet',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Origen de un registro: lo distingue de datos sincronizados o generados. */
export const RECORD_SOURCES = ['manual', 'import', 'bank', 'recurring', 'rule'] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

export const SYNC_STATUSES = ['synced', 'pending', 'error'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Dirección que exige cada tipo; `null` = puede ir en ambos sentidos. */
export const REQUIRED_DIRECTION: Readonly<Record<TransactionType, TransactionDirection | null>> = {
  income: 'inflow',
  refund: 'inflow',
  expense: 'outflow',
  fee: 'outflow',
  transfer: null,
  payment: null,
  investment: null,
};

export function accountNature(type: AccountType): AccountNature {
  return (LIABILITY_ACCOUNT_TYPES as readonly AccountType[]).includes(type) ? 'liability' : 'asset';
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isTransactionDirection(value: unknown): value is TransactionDirection {
  return typeof value === 'string' && (TRANSACTION_DIRECTIONS as readonly string[]).includes(value);
}

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === 'string' && (TRANSACTION_STATUSES as readonly string[]).includes(value);
}
