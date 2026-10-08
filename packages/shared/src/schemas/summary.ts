import { ACCOUNT_TYPES, TRANSACTION_DIRECTIONS, TRANSACTION_TYPES } from '@cf/domain';
import { z } from 'zod';
import { uuidSchema } from './common.js';
import { budgetStatusDtoSchema } from './budgets.js';
import { moneyDtoSchema } from './money.js';

const positionTotalsDtoSchema = z.object({
  /** Cuentas corrientes, de ahorro, efectivo y billeteras. El cupo de tarjetas no es disponible. */
  liquid: moneyDtoSchema,
  investments: moneyDtoSchema,
  /** Lo que se debe en tarjetas y créditos. */
  liabilities: moneyDtoSchema,
  assets: moneyDtoSchema,
  /** Activos − pasivos. */
  netWorth: moneyDtoSchema,
});

const positionAccountDtoSchema = z.object({
  accountId: uuidSchema,
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
  group: z.enum(['liquid', 'investment', 'liability']),
  currency: z.string().length(3),
  startsOn: z.string().nullable(),
  /** En la moneda base. */
  today: moneyDtoSchema,
  endOfMonth: moneyDtoSchema,
  /** Conversión aplicada si la cuenta está en otra moneda (tasa de hoy). */
  conversion: z
    .object({
      rate: z.string(),
      rateDate: z.string(),
      source: z.string(),
      stale: z.boolean(),
      daysOutdated: z.number().int().min(0),
    })
    .nullable(),
});

export const summaryDtoSchema = z.object({
  /** «Hoy» del usuario. */
  asOf: z.string(),
  /** Último día del mes actual: límite de la proyección «a fin de mes». */
  monthEnd: z.string(),
  baseCurrency: z.string().length(3),
  position: z.object({
    today: positionTotalsDtoSchema,
    /** Con lo programado hasta fin de mes (movimientos con fecha futura registrados). */
    endOfMonth: positionTotalsDtoSchema,
    accounts: z.array(positionAccountDtoSchema),
    /** Cuentas en otra moneda sin tasa confiable: no se suman (nunca se inventa una tasa). */
    unconverted: z.array(
      z.object({
        accountId: uuidSchema,
        name: z.string(),
        currency: z.string().length(3),
        reason: z.enum(['missing_rate', 'stale_rate']),
      }),
    ),
    /** Cuentas marcadas para no incluirse en el patrimonio. */
    excluded: z.array(z.object({ accountId: uuidSchema, name: z.string() })),
    /** `true` si algún total usa una tasa que ya no rige hoy. */
    estimated: z.boolean(),
    /** Movimientos programados después de fin de mes (no entran en `endOfMonth`). */
    scheduledAfterMonthEnd: z.number().int().min(0),
  }),
  month: z.object({
    period: z.object({ from: z.string(), to: z.string() }),
    income: moneyDtoSchema,
    netExpenses: moneyDtoSchema,
    net: moneyDtoSchema,
    savingsRate: z.string().nullable(),
    scheduled: z.object({
      income: moneyDtoSchema,
      netExpenses: moneyDtoSchema,
      count: z.number().int().min(0),
    }),
  }),
  budgets: z.object({
    /** Presupuestos vigentes este mes. */
    count: z.number().int().min(0),
    /** Los de mayor uso primero (máx. 5). */
    top: z.array(budgetStatusDtoSchema),
  }),
  /** Próximos movimientos programados (fecha posterior a hoy), del más cercano al más lejano (máx. 5). */
  upcoming: z.array(
    z.object({
      id: uuidSchema,
      transactionDate: z.string(),
      description: z.string(),
      type: z.enum(TRANSACTION_TYPES),
      direction: z.enum(TRANSACTION_DIRECTIONS),
      /** En la moneda de la cuenta. */
      amount: moneyDtoSchema,
      accountId: uuidSchema,
      accountName: z.string(),
      categoryId: uuidSchema.nullable(),
    }),
  ),
});
export type SummaryDto = z.infer<typeof summaryDtoSchema>;
