import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, deletedAt, money, primaryId, updatedAt } from './columns.js';
import { budgetPeriodEnum } from './enums.js';
import { users } from './identity.js';
import { categories, currencies } from './reference.js';

/**
 * Presupuestos con vigencia. Cada fila es un límite mensual para una categoría
 * de gasto (con sus subcategorías) o global (`category_id` NULL), vigente desde
 * `valid_from` (primer día de un mes) hasta `valid_to` (último día de un mes;
 * NULL = sin fin).
 *
 * Cambiar el monto no reescribe el pasado (§52): se cierra la versión vigente
 * al final del mes anterior y se abre otra desde el mes del cambio. Así cada mes
 * conserva el límite que tenía.
 *
 * Integridad en la base: monto positivo, meses completos y, con una restricción
 * de exclusión (migración 0003), nunca dos versiones vigentes que se solapen
 * para el mismo usuario y categoría.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id),
    period: budgetPeriodEnum('period').notNull().default('monthly'),
    amount: money('amount').notNull(),
    currency: currencyCode('currency')
      .notNull()
      .references(() => currencies.code),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('budgets_amount_positive', sql`${t.amount} > 0`),
    check('budgets_valid_from_month_start', sql`extract(day from ${t.validFrom}) = 1`),
    check(
      'budgets_valid_to_month_end',
      sql`${t.validTo} IS NULL OR extract(day from (${t.validTo} + 1)) = 1`,
    ),
    check('budgets_valid_range', sql`${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`),
    index('budgets_user_validity_idx')
      .on(t.userId, t.validFrom)
      .where(sql`${t.deletedAt} IS NULL`),
    index('budgets_category_idx').on(t.categoryId),
  ],
);
