import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, fxRate, instant, primaryId } from './columns.js';
import { currencies } from './reference.js';

/**
 * Tasas de cambio obtenidas de proveedores (p. ej. TRM oficial). Histórico de
 * solo inserción: una tasa publicada nunca se sobrescribe.
 *
 * `rate` = unidades de `quote_currency` por 1 unidad de `base_currency`.
 * Ej.: base USD, quote COP, rate 4050 → 1 USD = 4.050 COP.
 *
 * Las tasas que el usuario escribe a mano para una transacción no viven aquí:
 * se guardan en la propia transacción con `fx_source = 'manual'`.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: primaryId(),
    baseCurrency: currencyCode('base_currency')
      .notNull()
      .references(() => currencies.code),
    quoteCurrency: currencyCode('quote_currency')
      .notNull()
      .references(() => currencies.code),
    rate: fxRate('rate').notNull(),
    rateDate: date('rate_date', { mode: 'string' }).notNull(),
    source: varchar('source', { length: 60 }).notNull(),
    fetchedAt: instant('fetched_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('exchange_rates_positive', sql`${t.rate} > 0`),
    check('exchange_rates_distinct_pair', sql`${t.baseCurrency} <> ${t.quoteCurrency}`),
    uniqueIndex('exchange_rates_source_pair_date_uq').on(
      t.source,
      t.baseCurrency,
      t.quoteCurrency,
      t.rateDate,
    ),
    index('exchange_rates_pair_date_idx').on(t.baseCurrency, t.quoteCurrency, t.rateDate.desc()),
  ],
);
