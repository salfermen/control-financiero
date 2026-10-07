import { registerRequestSchema } from '@cf/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { ZodPipe } from './zod.pipe.js';

describe('ZodPipe', () => {
  const pipe = new ZodPipe(registerRequestSchema);

  it('devuelve los datos transformados', () => {
    const output = pipe.transform({
      email: ' A@B.CO ',
      password: 'una-frase-larga-segura',
      displayName: 'Ana',
      acceptTerms: true,
    });
    expect(output.email).toBe('a@b.co');
    expect(output.locale).toBe('es-CO');
  });

  it('lanza AppError con detalle por campo', () => {
    try {
      pipe.transform({ email: 'x' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.status).toBe(400);
      expect(appError.issues?.map((i) => i.path)).toEqual(
        expect.arrayContaining(['email', 'password', 'displayName', 'acceptTerms']),
      );
    }
  });

  it('trata un cuerpo ausente como objeto vacío', () => {
    expect(() => pipe.transform(undefined)).toThrow(AppError);
  });
});
