import type { z } from 'zod';
import type { FieldIssue } from './errors.js';

/** Convierte los errores de Zod en una lista plana y serializable de campos. */
export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
