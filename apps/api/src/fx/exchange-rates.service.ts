import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, exchangeRates } from '@cf/db';
import {
  type ExchangeRate,
  type LocalDate,
  type RateResolution,
  createExchangeRate,
  rateVariation,
  resolveRateForDate,
} from '@cf/domain';
import type { ExchangeRateDto, ExchangeRateLookupDto } from '@cf/shared';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import type { Executor } from '../finance/finance-context.service.js';

/**
 * Máximo de días que una tasa puede llevar sin regir para usarse en una
 * conversión automática (cubre fines de semana largos y festivos). Pasado
 * ese plazo se exige el valor cobrado o una tasa explícita.
 */
export const MAX_RATE_STALENESS_DAYS = 5;

type RateRow = typeof exchangeRates.$inferSelect;

function toDomain(row: RateRow): ExchangeRate {
  return createExchangeRate({
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: row.rate,
    rateDate: row.rateDate,
    validUntil: row.validUntil,
    source: row.source,
    id: row.id,
  });
}

function toDto(row: RateRow): ExchangeRateDto {
  return {
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: row.rate,
    rateDate: row.rateDate,
    validUntil: row.validUntil,
    source: row.source,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

/**
 * Lectura del histórico de tasas. La API nunca consulta proveedores externos:
 * el worker los sincroniza y aquí solo se usa lo guardado, con su fuente.
 */
@Injectable()
export class ExchangeRatesService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** Las dos tasas publicadas más recientes del par hasta `date` (inclusive). */
  private async latestRows(
    base: string,
    quote: string,
    date: LocalDate,
    executor: Executor,
  ): Promise<RateRow[]> {
    return executor
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, base),
          eq(exchangeRates.quoteCurrency, quote),
          lte(exchangeRates.rateDate, date),
        ),
      )
      .orderBy(desc(exchangeRates.rateDate), desc(exchangeRates.fetchedAt))
      .limit(2);
  }

  /**
   * Tasa para convertir `from` → `to` en `date`, en cualquiera de los dos
   * sentidos guardados. `null` si no hay una vigente o lo bastante reciente.
   */
  async forConversion(
    from: string,
    to: string,
    date: LocalDate,
    executor: Executor = this.database.db,
  ): Promise<ExchangeRate | null> {
    const resolution = await this.resolve(from, to, date, executor);
    if (resolution.status === 'current') return resolution.rate;
    if (resolution.status === 'stale' && resolution.daysOutdated <= MAX_RATE_STALENESS_DAYS) {
      return resolution.rate;
    }
    return null;
  }

  /**
   * Mejor tasa que rige en `date` para el par en cualquiera de los dos
   * sentidos guardados: la vigente si existe; si no, la menos atrasada. Quien
   * llama decide cuánto atraso acepta (la resolución lo informa).
   */
  async resolve(
    from: string,
    to: string,
    date: LocalDate,
    executor: Executor = this.database.db,
  ): Promise<RateResolution> {
    let best: RateResolution = { status: 'missing' };
    for (const [base, quote] of [
      [from, to],
      [to, from],
    ] as const) {
      const rows = await this.latestRows(base, quote, date, executor);
      const resolution = resolveRateForDate(rows.map(toDomain), date);
      if (resolution.status === 'current') return resolution;
      if (
        resolution.status === 'stale' &&
        (best.status === 'missing' ||
          (best.status === 'stale' && resolution.daysOutdated < best.daysOutdated))
      ) {
        best = resolution;
      }
    }
    return best;
  }

  /** Tasa vigente para mostrar (p. ej. USD/COP en el inicio), con su variación. */
  async lookup(base: string, quote: string, date: LocalDate): Promise<ExchangeRateLookupDto> {
    const rows = await this.latestRows(base, quote, date, this.database.db);
    const resolution = resolveRateForDate(rows.map(toDomain), date);
    if (resolution.status === 'missing') {
      return { date, status: 'missing', daysOutdated: 0, rate: null, change: null };
    }
    const [latest, previous] = rows;
    const change =
      latest && previous
        ? {
            previousRate: previous.rate,
            previousDate: previous.rateDate,
            ...rateVariation(toDomain(latest), toDomain(previous)),
          }
        : null;
    return {
      date,
      status: resolution.status,
      daysOutdated: resolution.status === 'stale' ? resolution.daysOutdated : 0,
      rate: latest ? toDto(latest) : null,
      change,
    };
  }

  /** Histórico del par en un rango (máximo 400 publicaciones). */
  async history(base: string, quote: string, from: LocalDate, to: LocalDate) {
    const rows = await this.database.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, base),
          eq(exchangeRates.quoteCurrency, quote),
          gte(exchangeRates.rateDate, from),
          lte(exchangeRates.rateDate, to),
        ),
      )
      .orderBy(asc(exchangeRates.rateDate), asc(exchangeRates.fetchedAt))
      .limit(400);
    return rows.map(toDto);
  }
}
