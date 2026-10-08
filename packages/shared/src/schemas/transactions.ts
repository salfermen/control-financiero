import {
  PAYMENT_METHODS,
  RECORD_SOURCES,
  TRANSACTION_DIRECTIONS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '@cf/domain';
import { z } from 'zod';
import { currencyCodeSchema, uuidSchema } from './common.js';
import { localDateSchema, moneyDtoSchema, positiveAmountSchema, rateSchema } from './money.js';

const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Escribe una descripción.')
  .max(255, 'La descripción no puede superar 255 caracteres.');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres.`)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/** Al crear, un movimiento queda asentado o pendiente; `void` solo llega desde el banco. */
export const entryStatusSchema = z.enum(['posted', 'pending']);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/**
 * Conversión cuando el monto está en otra moneda que la cuenta. Si no se
 * envía, la API busca la tasa oficial del día (TRM para USD/COP); si no la
 * tiene, responde EXCHANGE_RATE_UNAVAILABLE y la persona elige una opción:
 */
export const fxInputSchema = z
  .object({
    /** Lo que realmente cobró el banco en la moneda de la cuenta (manda sobre cualquier tasa). */
    accountAmount: positiveAmountSchema.optional(),
    /** Tasa que aplicó el banco: unidades de la moneda de la cuenta por 1 unidad del monto. */
    rate: rateSchema.optional(),
  })
  .strict()
  .refine(
    (value) => !(value.accountAmount !== undefined && value.rate !== undefined),
    'Envía el valor cobrado o la tasa, no ambos.',
  );

const incomeExpenseFields = {
  accountId: uuidSchema,
  /** Monto en la moneda del comercio (por defecto, la de la cuenta). */
  amount: positiveAmountSchema,
  currency: currencyCodeSchema.optional(),
  fx: fxInputSchema.optional(),
  transactionDate: localDateSchema,
  description: descriptionSchema,
  merchantName: optionalText(120),
  categoryId: uuidSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  status: entryStatusSchema.default('posted'),
  notes: optionalText(2000),
};

export const createExpenseRequestSchema = z
  .object({ kind: z.literal('expense'), ...incomeExpenseFields })
  .strict();
export const createIncomeRequestSchema = z
  .object({ kind: z.literal('income'), ...incomeExpenseFields })
  .strict();
export const createFeeRequestSchema = z
  .object({ kind: z.literal('fee'), ...incomeExpenseFields })
  .strict();

/**
 * Transferencia entre cuentas propias. Si el destino es una tarjeta o un
 * préstamo, se registra como pago (no es gasto: el gasto se contó al comprar).
 */
export const createTransferRequestSchema = z
  .object({
    kind: z.literal('transfer'),
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    /** Lo que sale, en la moneda de la cuenta de origen. */
    amount: positiveAmountSchema,
    /** Lo que llega, en la moneda de destino. Obligatorio si las monedas difieren y no hay tasa oficial. */
    receivedAmount: positiveAmountSchema.optional(),
    transactionDate: localDateSchema,
    /** Fecha de llegada si es posterior (transferencias interbancarias). */
    receivedDate: localDateSchema.optional(),
    description: descriptionSchema.optional(),
    status: entryStatusSchema.default('posted'),
    notes: optionalText(2000),
  })
  .strict()
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: 'Elige dos cuentas distintas.',
    path: ['toAccountId'],
  });

/** Reembolso de un gasto o comisión. */
export const createRefundRequestSchema = z
  .object({
    kind: z.literal('refund'),
    refundOfId: uuidSchema,
    /** Monto devuelto en la moneda ORIGINAL de la compra. */
    amount: positiveAmountSchema,
    /** Lo que se abonó en la moneda de la cuenta, si la compra fue en otra moneda. */
    fx: fxInputSchema.optional(),
    transactionDate: localDateSchema,
    description: descriptionSchema.optional(),
    status: entryStatusSchema.default('posted'),
    notes: optionalText(2000),
  })
  .strict();

export const createTransactionRequestSchema = z.discriminatedUnion('kind', [
  createExpenseRequestSchema,
  createIncomeRequestSchema,
  createFeeRequestSchema,
  createTransferRequestSchema,
  createRefundRequestSchema,
]);
export type CreateTransactionRequest = z.input<typeof createTransactionRequestSchema>;
export const TRANSACTION_KINDS = ['expense', 'income', 'fee', 'transfer', 'refund'] as const;

/**
 * Cambios permitidos sobre un movimiento existente. El monto solo se puede
 * cambiar en movimientos de una sola moneda que no sean transferencias ni
 * reembolsos; para lo demás, se elimina y se registra de nuevo.
 */
export const updateTransactionRequestSchema = z
  .object({
    description: descriptionSchema.optional(),
    merchantName: clearableText(120),
    categoryId: uuidSchema.nullable().optional(),
    paymentMethod: paymentMethodSchema.nullable().optional(),
    notes: clearableText(2000),
    status: entryStatusSchema.optional(),
    transactionDate: localDateSchema.optional(),
    amount: positiveAmountSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un cambio.');
export type UpdateTransactionRequest = z.input<typeof updateTransactionRequestSchema>;

export const transactionListQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    status: z.enum(TRANSACTION_STATUSES).optional(),
    /** Busca en descripción y comercio. */
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['to'],
  });
export type TransactionListQuery = z.input<typeof transactionListQuerySchema>;

export const fxDtoSchema = z.object({
  /** Unidades de la moneda de la cuenta por 1 unidad original (`null` si no hubo cambio). */
  accountRate: z.string().nullable(),
  /** Unidades de la moneda base por 1 unidad original. */
  baseRate: z.string().nullable(),
  source: z.string(),
  convertedAt: z.iso.datetime({ offset: true }),
  /**
   * `true` si el valor convertido se calculó con una tasa (TRM o manual) y no
   * con lo que realmente cobró el banco: es una estimación.
   */
  estimated: z.boolean(),
});
export type FxDto = z.infer<typeof fxDtoSchema>;

export const transactionDtoSchema = z.object({
  id: uuidSchema,
  accountId: uuidSchema,
  type: z.enum(TRANSACTION_TYPES),
  direction: z.enum(TRANSACTION_DIRECTIONS),
  status: z.enum(TRANSACTION_STATUSES),
  transactionDate: z.string(),
  postedDate: z.string().nullable(),
  description: z.string(),
  merchantName: z.string().nullable(),
  categoryId: uuidSchema.nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  notes: z.string().nullable(),
  /** En la moneda de la cuenta: es lo que mueve el saldo. Siempre positivo; el sentido lo da `direction`. */
  amount: moneyDtoSchema,
  /** Lo que cobró el comercio, en su moneda (nunca se modifica). */
  original: moneyDtoSchema,
  /** En la moneda base del usuario, con la tasa del día del movimiento. */
  base: moneyDtoSchema,
  fx: fxDtoSchema.nullable(),
  transferGroupId: uuidSchema.nullable(),
  /** Cuenta de la otra pata en transferencias y pagos. */
  counterpartAccountId: uuidSchema.nullable(),
  refundOfId: uuidSchema.nullable(),
  source: z.enum(RECORD_SOURCES),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type TransactionDto = z.infer<typeof transactionDtoSchema>;

export const transactionListDtoSchema = z.object({
  data: z.array(transactionDtoSchema),
  /** Pásalo como `cursor` para la siguiente página; `null` si no hay más. */
  nextCursor: z.string().nullable(),
});
export type TransactionListDto = z.infer<typeof transactionListDtoSchema>;
