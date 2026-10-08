import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DomainError } from '@cf/domain';
import { describe, expect, it } from 'vitest';
import { AppError } from './app-error.js';
import { languageFrom, mapError } from './error-mapping.js';

describe('mapError', () => {
  it('respeta el código y los campos de AppError', () => {
    const mapped = mapError(new AppError('VALIDATION_ERROR', [{ path: 'email', message: 'x' }]));
    expect(mapped).toEqual({
      code: 'VALIDATION_ERROR',
      status: 400,
      issues: [{ path: 'email', message: 'x' }],
      unexpected: false,
    });
  });

  it('traduce errores del Financial Engine', () => {
    expect(mapError(new DomainError('MISSING_EXCHANGE_RATE', 'x'))).toEqual({
      code: 'EXCHANGE_RATE_UNAVAILABLE',
      status: 422,
      unexpected: false,
    });
    expect(mapError(new DomainError('INVALID_REFUND', 'x'))).toMatchObject({
      code: 'RULE_VIOLATION',
      status: 422,
    });
    expect(mapError(new DomainError('TOO_MANY_DECIMALS', 'x'))).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(mapError(new DomainError('DATE_BEFORE_OPENING_BALANCE', 'x'))).toMatchObject({
      code: 'TRANSACTION_BEFORE_OPENING_BALANCE',
    });
    // Un error interno del motor es un defecto del servidor, no del usuario.
    expect(mapError(new DomainError('ACCOUNT_MISMATCH', 'x'))).toMatchObject({
      code: 'INTERNAL_ERROR',
      unexpected: true,
    });
  });

  it('traduce excepciones HTTP de Nest', () => {
    expect(mapError(new NotFoundException())).toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(mapError(new BadRequestException())).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(mapError(new InternalServerErrorException())).toMatchObject({
      code: 'INTERNAL_ERROR',
      unexpected: true,
    });
  });

  it('traduce errores de Fastify por su statusCode', () => {
    const tooLarge = Object.assign(new Error('x'), {
      statusCode: 413,
      code: 'FST_ERR_CTP_BODY_TOO_LARGE',
    });
    expect(mapError(tooLarge)).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });

  it('convierte violaciones de unicidad en CONFLICT, incluso envueltas', () => {
    const pg = Object.assign(new Error('duplicate'), { code: '23505' });
    expect(mapError(pg)).toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(mapError(Object.assign(new Error('wrap'), { cause: pg }))).toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('trata la base caída como servicio no disponible', () => {
    expect(mapError(Object.assign(new Error('x'), { code: '08006' }))).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
  });

  it('lo desconocido es un error interno genérico', () => {
    for (const value of [new Error('boom'), 'texto', null, undefined, { statusCode: 418 }]) {
      expect(mapError(value)).toEqual({ code: 'INTERNAL_ERROR', status: 500, unexpected: true });
    }
  });
});

describe('languageFrom', () => {
  it.each([
    [undefined, 'es'],
    ['es-CO,es;q=0.9', 'es'],
    ['en-US,en;q=0.9', 'en'],
    [['EN'], 'en'],
    ['fr-FR', 'es'],
  ] as const)('%j → %s', (header, expected) => {
    expect(languageFrom(header as string | string[] | undefined)).toBe(expected);
  });
});
