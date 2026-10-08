/**
 * Enums de PostgreSQL. Los del libro se generan desde las listas de @cf/domain
 * (fuente única): el motor y la base nunca pueden discrepar.
 */
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CATEGORY_KINDS,
  PAYMENT_METHODS,
  RECORD_SOURCES,
  SYNC_STATUSES,
  TRANSACTION_DIRECTIONS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '@cf/domain';
import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'pending_deletion', 'disabled']);

export const themePreferenceEnum = pgEnum('theme_preference', ['system', 'light', 'dark']);

export const sessionTransportEnum = pgEnum('session_transport', ['cookie', 'bearer']);

export const consentTypeEnum = pgEnum('consent_type', ['terms_of_service', 'privacy_policy']);

export const actorTypeEnum = pgEnum('actor_type', ['user', 'system']);

export const categoryKindEnum = pgEnum('category_kind', CATEGORY_KINDS);

export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);

export const accountStatusEnum = pgEnum('account_status', ACCOUNT_STATUSES);

export const recordSourceEnum = pgEnum('record_source', RECORD_SOURCES);

export const syncStatusEnum = pgEnum('sync_status', SYNC_STATUSES);

export const transactionTypeEnum = pgEnum('transaction_type', TRANSACTION_TYPES);

export const transactionDirectionEnum = pgEnum('transaction_direction', TRANSACTION_DIRECTIONS);

export const transactionStatusEnum = pgEnum('transaction_status', TRANSACTION_STATUSES);

export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);

export const budgetPeriodEnum = pgEnum('budget_period', BUDGET_PERIODS);
