import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, deletedAt, primaryId, updatedAt } from './columns.js';
import { categoryKindEnum } from './enums.js';
import { users } from './identity.js';

/** Monedas soportadas (datos de referencia, sembrados desde @cf/domain). */
export const currencies = pgTable(
  'currencies',
  {
    code: currencyCode('code').primaryKey(),
    nameEs: varchar('name_es', { length: 60 }).notNull(),
    nameEn: varchar('name_en', { length: 60 }).notNull(),
    minorUnit: smallint('minor_unit').notNull(),
    displayDecimals: smallint('display_decimals').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('currencies_code_format', sql`${t.code} ~ '^[A-Z]{3}$'`),
    check('currencies_minor_unit_range', sql`${t.minorUnit} BETWEEN 0 AND 4`),
    check(
      'currencies_display_decimals_range',
      sql`${t.displayDecimals} BETWEEN 0 AND ${t.minorUnit}`,
    ),
  ],
);

/**
 * Categorías. `user_id` NULL = categoría del sistema (con `system_key`);
 * con `user_id` = categoría personalizada del usuario.
 */
export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    kind: categoryKindEnum('kind').notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    systemKey: varchar('system_key', { length: 60 }),
    icon: varchar('icon', { length: 40 }),
    color: varchar('color', { length: 20 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('categories_system_xor_user', sql`(${t.userId} IS NULL) = (${t.systemKey} IS NOT NULL)`),
    check('categories_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    check('categories_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    uniqueIndex('categories_system_key_uq').on(t.systemKey),
    uniqueIndex('categories_user_kind_name_uq')
      .on(t.userId, t.kind, t.name)
      .where(sql`${t.deletedAt} IS NULL`),
    index('categories_user_idx').on(t.userId),
    index('categories_parent_idx').on(t.parentId),
  ],
);
