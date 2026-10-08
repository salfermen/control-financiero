import { ACCOUNT_STATUSES, ACCOUNT_TYPES, RECORD_SOURCES } from '@cf/domain';
import { z } from 'zod';
import { currencyCodeSchema, uuidSchema } from './common.js';
import { localDateSchema, moneyDtoSchema, signedAmountSchema } from './money.js';

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);

const accountNameSchema = z
  .string()
  .trim()
  .min(1, 'Ponle un nombre a la cuenta.')
  .max(80, 'El nombre no puede superar 80 caracteres.');

/** Texto opcional: vacío equivale a no enviarlo. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres.`)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/** Texto que se puede borrar enviando `null` o vacío. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const createAccountRequestSchema = z
  .object({
    name: accountNameSchema,
    type: accountTypeSchema,
    currency: currencyCodeSchema,
    institutionName: optionalText(80),
    /**
     * Saldo al inicio de `openingBalanceDate`. En tarjetas y préstamos es lo
     * que se debe (positivo).
     */
    openingBalance: signedAmountSchema.default('0'),
    openingBalanceDate: localDateSchema,
    includeInNetWorth: z.boolean().default(true),
    notes: optionalText(2000),
  })
  .strict();
export type CreateAccountRequest = z.input<typeof createAccountRequestSchema>;

export const updateAccountRequestSchema = z
  .object({
    name: accountNameSchema.optional(),
    institutionName: clearableText(80),
    openingBalance: signedAmountSchema.optional(),
    openingBalanceDate: localDateSchema.optional(),
    includeInNetWorth: z.boolean().optional(),
    notes: clearableText(2000),
    /** `closed` oculta la cuenta para nuevos movimientos; su historial se conserva. */
    status: accountStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un cambio.');
export type UpdateAccountRequest = z.input<typeof updateAccountRequestSchema>;

export const accountBalanceDtoSchema = z.object({
  /** Fecha de corte: «hoy» en la zona horaria del usuario. */
  asOf: z.string(),
  /**
   * Fecha en que empieza la cuenta si su saldo inicial es posterior a hoy: hoy
   * no tiene saldo y su saldo inicial cuenta como programado. `null` si ya empezó.
   */
  startsOn: z.string().nullable(),
  posted: moneyDtoSchema,
  pending: moneyDtoSchema,
  /** Saldo de hoy (asentado + pendiente). En tarjetas y préstamos: lo que se debe. */
  current: moneyDtoSchema,
  /** Efecto neto de lo programado: movimientos con fecha posterior a hoy. */
  scheduled: moneyDtoSchema,
  /** `current + scheduled`: lo que quedará después de lo programado. */
  projected: moneyDtoSchema,
  /** Fecha del último movimiento programado; `null` si no hay. */
  projectedThrough: z.string().nullable(),
  /** Movimientos incluidos hasta hoy (asentados + pendientes). */
  transactionCount: z.number().int().min(0),
  /** Movimientos con fecha posterior a hoy. */
  scheduledCount: z.number().int().min(0),
  /** Movimientos anteriores al saldo inicial: no se suman (ya están en él). */
  excludedBeforeOpening: z.number().int().min(0),
});
export type AccountBalanceDto = z.infer<typeof accountBalanceDtoSchema>;

export const accountDtoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: accountTypeSchema,
  /** `asset` = dinero que se tiene; `liability` = dinero que se debe. */
  nature: z.enum(['asset', 'liability']),
  status: accountStatusSchema,
  institutionName: z.string().nullable(),
  currency: z.string().length(3),
  openingBalance: moneyDtoSchema,
  openingBalanceDate: z.string(),
  includeInNetWorth: z.boolean(),
  notes: z.string().nullable(),
  /** Origen del registro: manual (dato real del usuario), import o bank (sincronizado). */
  source: z.enum(RECORD_SOURCES),
  balance: accountBalanceDtoSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type AccountDto = z.infer<typeof accountDtoSchema>;
