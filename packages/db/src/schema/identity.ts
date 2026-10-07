import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, instant, primaryId, sha256Hex, updatedAt } from './columns.js';
import {
  consentTypeEnum,
  sessionTransportEnum,
  themePreferenceEnum,
  userStatusEnum,
} from './enums.js';
import { currencies } from './reference.js';

/**
 * Usuarios. El borrado de cuenta pasa por `pending_deletion` y luego se borra
 * físicamente (con cascada a todos sus datos), por eso no hay `deleted_at`.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    status: userStatusEnum('status').notNull().default('active'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: instant('locked_until'),
    lastLoginAt: instant('last_login_at'),
    emailVerifiedAt: instant('email_verified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_failed_login_non_negative', sql`${t.failedLoginCount} >= 0`),
  ],
);

export const userSettings = pgTable(
  'user_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    baseCurrency: currencyCode('base_currency')
      .notNull()
      .default('COP')
      .references(() => currencies.code),
    locale: varchar('locale', { length: 10 }).notNull().default('es-CO'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('America/Bogota'),
    theme: themePreferenceEnum('theme').notNull().default('system'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('user_settings_locale_supported', sql`${t.locale} IN ('es-CO', 'en-US')`)],
);

/**
 * Sesiones opacas. Solo se guarda el SHA-256 del token: una copia de la base
 * de datos no permite suplantar sesiones.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: sha256Hex('token_hash').notNull(),
    transport: sessionTransportEnum('transport').notNull(),
    createdAt: createdAt(),
    expiresAt: instant('expires_at').notNull(),
    lastUsedAt: instant('last_used_at').notNull().defaultNow(),
    revokedAt: instant('revoked_at'),
    userAgent: varchar('user_agent', { length: 512 }),
    ipHash: sha256Hex('ip_hash'),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    check('sessions_expiry_after_creation', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

/** Consentimientos otorgados (términos, privacidad; más adelante IA y banca). */
export const consents = pgTable(
  'consents',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: consentTypeEnum('type').notNull(),
    version: varchar('version', { length: 20 }).notNull(),
    grantedAt: instant('granted_at').notNull().defaultNow(),
    revokedAt: instant('revoked_at'),
    ipHash: sha256Hex('ip_hash'),
  },
  (t) => [uniqueIndex('consents_user_type_version_uq').on(t.userId, t.type, t.version)],
);
