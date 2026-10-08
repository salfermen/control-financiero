import { BUDGET_LEVELS } from '@cf/domain';
import { z } from 'zod';
import { uuidSchema } from './common.js';
import { moneyDtoSchema, positiveAmountSchema, yearMonthSchema } from './money.js';

export const budgetLevelSchema = z.enum(BUDGET_LEVELS);

export const budgetsQuerySchema = z
  .object({
    /** Mes a consultar; por defecto, el mes actual del usuario. */
    month: yearMonthSchema.optional(),
  })
  .strict();

/**
 * Presupuesto mensual. `categoryId: null` = global (todos los gastos). Rige
 * desde `startMonth` (por defecto el mes actual) en adelante, hasta que se
 * cambie o se quite.
 */
export const createBudgetRequestSchema = z
  .object({
    categoryId: uuidSchema.nullable(),
    amount: positiveAmountSchema,
    startMonth: yearMonthSchema.optional(),
  })
  .strict();
export type CreateBudgetRequest = z.input<typeof createBudgetRequestSchema>;

/**
 * Cambia el límite desde `fromMonth` (por defecto el mes actual). Los meses
 * anteriores conservan el límite que tenían.
 */
export const updateBudgetRequestSchema = z
  .object({
    amount: positiveAmountSchema,
    fromMonth: yearMonthSchema.optional(),
  })
  .strict();
export type UpdateBudgetRequest = z.input<typeof updateBudgetRequestSchema>;

/** Deja de presupuestar desde `fromMonth` (por defecto el mes actual); el historial se conserva. */
export const deleteBudgetQuerySchema = z
  .object({
    fromMonth: yearMonthSchema.optional(),
  })
  .strict();

export const budgetPaceDtoSchema = z.object({
  /** Gasto estimado al cierre si se mantiene el ritmo de lo gastado hasta hoy. */
  projectedSpend: moneyDtoSchema,
  /** El mayor entre el ritmo y lo ya comprometido. */
  projectedClose: moneyDtoSchema,
  exceedsLimit: z.boolean(),
  daysElapsed: z.number().int(),
  daysInPeriod: z.number().int(),
});

export const budgetStatusDtoSchema = z.object({
  id: uuidSchema,
  /** `null` = presupuesto global. */
  categoryId: uuidSchema.nullable(),
  /** Nombre en el idioma del usuario; `null` en el global. */
  categoryName: z.string().nullable(),
  /** Subcategorías incluidas (sin contar la propia). */
  subcategoryCount: z.number().int().min(0),
  /** Vigencia de esta versión del presupuesto. */
  validFrom: z.string(),
  validTo: z.string().nullable(),
  limit: moneyDtoSchema,
  /** Gastos netos con fecha hasta hoy (asentados y pendientes). */
  spent: moneyDtoSchema,
  /** Gastos del mes con fecha posterior a hoy. */
  scheduled: moneyDtoSchema,
  committed: moneyDtoSchema,
  /** Límite − comprometido; negativo si se pasó. */
  remaining: moneyDtoSchema,
  /** Comprometido / límite con 4 decimales («0.7500» = 75 %). */
  usedRatio: z.string(),
  /** Gastado / límite (sin lo programado), 4 decimales. */
  spentRatio: z.string(),
  level: budgetLevelSchema,
  /** Estimación al ritmo actual (no es un hecho); `null` si no aplica. */
  pace: budgetPaceDtoSchema.nullable(),
  transactionCount: z.number().int().min(0),
});
export type BudgetStatusDto = z.infer<typeof budgetStatusDtoSchema>;

export const budgetsMonthDtoSchema = z.object({
  month: z.string(),
  period: z.object({ from: z.string(), to: z.string() }),
  /** «Hoy» del usuario: separa lo gastado de lo programado. */
  asOf: z.string(),
  baseCurrency: z.string().length(3),
  /** Umbrales de alerta (proporción del límite). */
  thresholds: z.object({ notice: z.string(), warning: z.string(), exceeded: z.string() }),
  /** Global primero; luego por categoría, de mayor a menor uso. */
  budgets: z.array(budgetStatusDtoSchema),
});
export type BudgetsMonthDto = z.infer<typeof budgetsMonthDtoSchema>;
