import { z } from 'zod';
import { currencyCodeSchema } from './common.js';
import { localDateSchema, moneyDtoSchema, yearMonthSchema } from './money.js';

export const exchangeRateQuerySchema = z
  .object({
    base: currencyCodeSchema.default('USD'),
    quote: currencyCodeSchema.default('COP'),
    /** Fecha para la que se busca la tasa vigente; por defecto, hoy del usuario. */
    date: localDateSchema.optional(),
  })
  .strict();

export const exchangeRateHistoryQuerySchema = z
  .object({
    base: currencyCodeSchema.default('USD'),
    quote: currencyCodeSchema.default('COP'),
    from: localDateSchema,
    to: localDateSchema,
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['to'],
  });

export const exchangeRateDtoSchema = z.object({
  baseCurrency: z.string().length(3),
  quoteCurrency: z.string().length(3),
  /** Unidades de `quoteCurrency` por 1 `baseCurrency`, 10 decimales. */
  rate: z.string(),
  rateDate: z.string(),
  validUntil: z.string().nullable(),
  /** Proveedor que publicó la tasa. */
  source: z.string(),
  /** Cuándo la obtuvo la plataforma. */
  fetchedAt: z.iso.datetime({ offset: true }),
});
export type ExchangeRateDto = z.infer<typeof exchangeRateDtoSchema>;

/**
 * Tasa vigente en una fecha. Si no hay datos, `status` es `missing` y `rate`
 * es `null`: la UI dice «Datos temporalmente no disponibles» y nunca inventa.
 */
export const exchangeRateLookupDtoSchema = z.object({
  date: z.string(),
  status: z.enum(['current', 'stale', 'missing']),
  /** Días desde que dejó de regir (solo con `stale`). */
  daysOutdated: z.number().int().min(0),
  rate: exchangeRateDtoSchema.nullable(),
  /** Variación frente a la tasa anterior publicada (solo si hay dos tasas). */
  change: z
    .object({
      previousRate: z.string(),
      previousDate: z.string(),
      /** Diferencia absoluta (unidades de la moneda cotizada). */
      absolute: z.string(),
      /** Variación relativa con 4 decimales: «0.0125» = 1,25 %. */
      relative: z.string(),
    })
    .nullable(),
});
export type ExchangeRateLookupDto = z.infer<typeof exchangeRateLookupDtoSchema>;

export const cashFlowQuerySchema = z
  .object({
    /** Mes contable; por defecto, el mes actual del usuario. */
    month: yearMonthSchema.optional(),
    includePending: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  .strict();

const categoryFlowDtoSchema = z.object({
  categoryId: z.string().nullable(),
  kind: z.enum(['income', 'expense']),
  gross: moneyDtoSchema,
  refunds: moneyDtoSchema,
  net: moneyDtoSchema,
  count: z.number().int().min(0),
});

export const cashFlowDtoSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  baseCurrency: z.string().length(3),
  includePending: z.boolean(),
  income: moneyDtoSchema,
  expenses: moneyDtoSchema,
  fees: moneyDtoSchema,
  refunds: moneyDtoSchema,
  netExpenses: moneyDtoSchema,
  net: moneyDtoSchema,
  savingsRate: z.string().nullable(),
  byCategory: z.array(categoryFlowDtoSchema),
  counted: z.object({
    income: z.number().int(),
    expense: z.number().int(),
    fee: z.number().int(),
    refund: z.number().int(),
  }),
  excluded: z.object({
    transfer: z.number().int(),
    payment: z.number().int(),
    investment: z.number().int(),
    void: z.number().int(),
    deleted: z.number().int(),
    pending: z.number().int(),
    outsidePeriod: z.number().int(),
  }),
});
export type CashFlowDto = z.infer<typeof cashFlowDtoSchema>;
