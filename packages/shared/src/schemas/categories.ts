import { z } from 'zod';
import { uuidSchema } from './common.js';

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre para la categoría.')
  .max(60, 'El nombre no puede superar 60 caracteres.');

/**
 * Categoría personalizada. Puede ser subcategoría de una categoría principal
 * (del sistema o propia) del mismo tipo: dos niveles como máximo.
 */
export const createCategoryRequestSchema = z
  .object({
    name: categoryNameSchema,
    kind: z.enum(['income', 'expense']),
    parentId: uuidSchema.nullable().default(null),
  })
  .strict();
export type CreateCategoryRequest = z.input<typeof createCategoryRequestSchema>;

/** El tipo (ingreso/gasto) no cambia: los movimientos ya registrados dependen de él. */
export const updateCategoryRequestSchema = z
  .object({
    name: categoryNameSchema.optional(),
    parentId: uuidSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un cambio.');
export type UpdateCategoryRequest = z.input<typeof updateCategoryRequestSchema>;

export const deleteCategoryQuerySchema = z
  .object({
    /** Categoría (del mismo tipo) a la que se mueven los movimientos antes de eliminar. */
    moveTo: uuidSchema.optional(),
  })
  .strict();
