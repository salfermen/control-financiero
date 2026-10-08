import { MAX_ABS_AMOUNT, isValidLocalDate } from '@cf/domain';
import { z } from 'zod';

/**
 * Montos en la API: SIEMPRE texto decimal con punto («59.99»), nunca `number`.
 * La UI convierte lo que escribe la persona («59,99», «25.000») con
 * `parseAmountInput` de @cf/domain antes de enviarlo.
 */
const AMOUNT_PATTERN = /^\d{1,16}(?:\.\d{1,4})?$/;
const SIGNED_AMOUNT_PATTERN = /^-?\d{1,16}(?:\.\d{1,4})?$/;

/** Monto estrictamente positivo (movimientos). */
export const positiveAmountSchema = z
  .string()
  .trim()
  .regex(AMOUNT_PATTERN, 'Escribe un monto válido, con hasta 4 decimales (p. ej. 25000 o 59.99).')
  .refine((value) => /[1-9]/.test(value), 'El monto debe ser mayor que cero.');

/** Monto con signo (saldos iniciales: un sobregiro puede ser negativo). */
export const signedAmountSchema = z
  .string()
  .trim()
  .regex(
    SIGNED_AMOUNT_PATTERN,
    'Escribe un monto válido, con hasta 4 decimales (p. ej. 1500000 o -20000).',
  );

/** Tasa de cambio: positiva, hasta 10 decimales. */
export const rateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(?:\.\d{1,10})?$/, 'Escribe una tasa válida, p. ej. 4050.25.')
  .refine((value) => /[1-9]/.test(value), 'La tasa debe ser mayor que cero.');

/** Fecha contable `AAAA-MM-DD` que existe en el calendario. */
export const localDateSchema = z
  .string()
  .refine(isValidLocalDate, 'Escribe una fecha válida (AAAA-MM-DD).');

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Escribe un mes válido (AAAA-MM).');

/** Monto en las respuestas: 4 decimales exactos y su moneda. */
export const moneyDtoSchema = z.object({
  amount: z.string().regex(/^-?\d{1,16}\.\d{4}$/),
  currency: z.string().length(3),
});
export type MoneyDto = z.infer<typeof moneyDtoSchema>;

/** Mayor monto aceptado (NUMERIC(20,4)); se expone para la UI. */
export const MAX_AMOUNT = MAX_ABS_AMOUNT;
