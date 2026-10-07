import type { PipeTransform } from '@nestjs/common';
import { toFieldIssues } from '@cf/shared';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/**
 * Valida y transforma la entrada con un esquema Zod compartido con el cliente.
 * Uso: `@Body(new ZodPipe(registerRequestSchema)) body: RegisterInput`.
 */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', toFieldIssues(result.error));
    }
    return result.data;
  }
}
