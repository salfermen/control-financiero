import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { apiErrorBodySchema } from '@cf/shared';
import { z } from 'zod';

/**
 * Los esquemas Zod de @cf/shared son la única definición de cada contrato:
 * validan en runtime y, desde aquí, generan la documentación OpenAPI.
 */
export function toOpenApiSchema(
  schema: z.ZodType,
  io: 'input' | 'output' = 'output',
): SchemaObject {
  const json = z.toJSONSchema(schema, { io, target: 'openapi-3.0', unrepresentable: 'any' });
  const { $schema: _ignored, ...rest } = json;
  return rest as SchemaObject;
}

export const ApiZodBody = (schema: z.ZodType) =>
  ApiBody({ schema: toOpenApiSchema(schema, 'input') });

export const ApiZodResponse = (status: number, schema: z.ZodType, description: string) =>
  ApiResponse({ status, description, schema: toOpenApiSchema(schema) });

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Datos inválidos (VALIDATION_ERROR), con detalle por campo en `issues`.',
  401: 'Sin sesión válida (UNAUTHENTICATED) o credenciales incorrectas (INVALID_CREDENTIALS).',
  403: 'Falta la cabecera anti-CSRF (CSRF_REJECTED) o no hay permiso.',
  404: 'No existe o no pertenece al usuario (NOT_FOUND).',
  409: 'Conflicto con datos existentes o con el estado del registro.',
  422: 'La operación no cumple las reglas financieras (RULE_VIOLATION, EXCHANGE_RATE_UNAVAILABLE, TRANSACTION_BEFORE_OPENING_BALANCE).',
  423: 'Cuenta bloqueada temporalmente por intentos fallidos (ACCOUNT_LOCKED).',
  429: 'Demasiadas solicitudes (RATE_LIMITED).',
};

/** Documenta las respuestas de error estándar `{ error: {...} }`. */
export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Error',
        schema: toOpenApiSchema(apiErrorBodySchema),
      }),
    ),
  );
