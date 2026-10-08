import type { PipeTransform } from '@nestjs/common';
import { uuidSchema } from '@cf/shared';
import { AppError } from '../common/errors/app-error.js';

/**
 * Valida un id de la URL. Un id mal formado responde 404 (igual que uno que no
 * existe o no es del usuario): no se revela nada sobre otros registros.
 */
export class UuidParamPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = uuidSchema.safeParse(value);
    if (!result.success) throw new AppError('NOT_FOUND');
    return result.data;
  }
}
