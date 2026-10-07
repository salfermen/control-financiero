import { z } from 'zod';

export const currencyDtoSchema = z.object({
  code: z.string().length(3),
  nameEs: z.string(),
  nameEn: z.string(),
  minorUnit: z.number().int().min(0).max(4),
  displayDecimals: z.number().int().min(0).max(4),
});
export type CurrencyDto = z.infer<typeof currencyDtoSchema>;

export const categoryDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['income', 'expense']),
  /** Nombre ya traducido al idioma del usuario. */
  name: z.string(),
  parentId: z.uuid().nullable(),
  /** `true` para categorías del sistema (no editables por el usuario). */
  isSystem: z.boolean(),
  systemKey: z.string().nullable(),
});
export type CategoryDto = z.infer<typeof categoryDtoSchema>;

export const healthDtoSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
  version: z.string(),
  time: z.iso.datetime({ offset: true }),
});
export type HealthDto = z.infer<typeof healthDtoSchema>;

/** Envoltura de listas: deja espacio para paginación sin romper clientes. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item) });
}
