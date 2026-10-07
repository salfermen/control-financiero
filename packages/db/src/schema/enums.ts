import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'pending_deletion', 'disabled']);

export const themePreferenceEnum = pgEnum('theme_preference', ['system', 'light', 'dark']);

export const sessionTransportEnum = pgEnum('session_transport', ['cookie', 'bearer']);

export const consentTypeEnum = pgEnum('consent_type', ['terms_of_service', 'privacy_policy']);

export const actorTypeEnum = pgEnum('actor_type', ['user', 'system']);

export const categoryKindEnum = pgEnum('category_kind', ['income', 'expense']);

export const accountTypeEnum = pgEnum('account_type', [
  'checking',
  'savings',
  'cash',
  'digital_wallet',
  'investment',
  'credit_card',
  'loan',
]);

export const accountStatusEnum = pgEnum('account_status', ['active', 'closed']);

/** Origen de un registro: lo distingue de datos sincronizados o generados. */
export const recordSourceEnum = pgEnum('record_source', [
  'manual',
  'import',
  'bank',
  'recurring',
  'rule',
]);

export const syncStatusEnum = pgEnum('sync_status', ['synced', 'pending', 'error']);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'income',
  'expense',
  'transfer',
  'refund',
  'payment',
  'fee',
  'investment',
]);

export const transactionDirectionEnum = pgEnum('transaction_direction', ['inflow', 'outflow']);

export const transactionStatusEnum = pgEnum('transaction_status', ['pending', 'posted', 'void']);

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'debit_card',
  'credit_card',
  'bank_transfer',
  'digital_wallet',
  'other',
]);

/** Tipos de cuenta que representan una obligación (pasivo), no dinero disponible. */
export const LIABILITY_ACCOUNT_TYPES = ['credit_card', 'loan'] as const;
