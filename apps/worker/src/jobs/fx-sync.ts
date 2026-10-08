import { exchangeRates, type Database } from '@cf/db';
import { addDays, localDateInTimeZone } from '@cf/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { ExchangeRateProvider } from '../integrations/fx/provider.js';

export interface FxSyncResult extends Record<string, number | string> {
  source: string;
  from: string;
  to: string;
  fetched: number;
  inserted: number;
  /** Publicaciones que ya estaban guardadas con el mismo valor. */
  unchanged: number;
  /** Publicaciones que difieren de lo guardado: se registran, no se sobrescriben. */
  conflicting: number;
}

/**
 * Descarga las tasas de un rango y guarda las nuevas. El histórico es de solo
 * inserción: si el proveedor publica un valor distinto para una fecha ya
 * guardada, no se reemplaza; se avisa en los logs para revisarlo.
 */
export async function syncExchangeRates(params: {
  db: Database;
  logger: Logger;
  provider: ExchangeRateProvider;
  from: string;
  to: string;
  now: Date;
}): Promise<FxSyncResult> {
  const { db, logger, provider, from, to, now } = params;
  const rates = await provider.fetchRates({ from, to });
  const result: FxSyncResult = {
    source: provider.source,
    from,
    to,
    fetched: rates.length,
    inserted: 0,
    unchanged: 0,
    conflicting: 0,
  };
  if (rates.length === 0) return result;

  const inserted = await db
    .insert(exchangeRates)
    .values(
      rates.map((rate) => ({
        baseCurrency: rate.baseCurrency,
        quoteCurrency: rate.quoteCurrency,
        rate: rate.rate,
        rateDate: rate.rateDate,
        validUntil: rate.validUntil,
        source: provider.source,
        fetchedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ rateDate: exchangeRates.rateDate });
  result.inserted = inserted.length;

  const insertedDates = new Set(inserted.map((row) => row.rateDate));
  const existingDates = rates.filter((rate) => !insertedDates.has(rate.rateDate));
  if (existingDates.length > 0) {
    const stored = await db
      .select({
        rateDate: exchangeRates.rateDate,
        rate: exchangeRates.rate,
        base: exchangeRates.baseCurrency,
        quote: exchangeRates.quoteCurrency,
      })
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.source, provider.source),
          inArray(
            exchangeRates.rateDate,
            existingDates.map((rate) => rate.rateDate),
          ),
        ),
      );
    for (const rate of existingDates) {
      const match = stored.find(
        (row) =>
          row.rateDate === rate.rateDate &&
          row.base === rate.baseCurrency &&
          row.quote === rate.quoteCurrency,
      );
      if (match && match.rate === rate.rate) {
        result.unchanged += 1;
      } else {
        result.conflicting += 1;
        logger.warn(
          {
            source: provider.source,
            rateDate: rate.rateDate,
            stored: match?.rate,
            published: rate.rate,
          },
          'El proveedor publicó un valor distinto al guardado; el histórico no se sobrescribe',
        );
      }
    }
  }
  return result;
}

/** Ventana de la sincronización diaria: 10 días atrás (festivos) y 5 adelante (TRM anticipada). */
export function dailyWindow(now: Date, timeZone: string): { from: string; to: string } {
  const today = localDateInTimeZone(now, timeZone);
  return { from: addDays(today, -10), to: addDays(today, 5) };
}
