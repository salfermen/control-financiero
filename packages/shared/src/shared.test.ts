import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  errorMessage,
  isApiErrorBody,
  loginRequestSchema,
  registerRequestSchema,
  toFieldIssues,
  updateSettingsRequestSchema,
} from './index.js';

const validRegister = {
  email: '  Ana.Perez@Example.COM ',
  password: 'una-frase-larga-segura',
  displayName: ' Ana ',
  acceptTerms: true,
};

describe('registerRequestSchema', () => {
  it('normaliza correo y nombre y aplica el locale por defecto', () => {
    const parsed = registerRequestSchema.parse(validRegister);
    expect(parsed.email).toBe('ana.perez@example.com');
    expect(parsed.displayName).toBe('Ana');
    expect(parsed.locale).toBe('es-CO');
  });

  it('exige aceptar términos de forma explícita', () => {
    expect(registerRequestSchema.safeParse({ ...validRegister, acceptTerms: false }).success).toBe(
      false,
    );
    const { acceptTerms: _omit, ...withoutTerms } = validRegister;
    expect(registerRequestSchema.safeParse(withoutTerms).success).toBe(false);
  });

  it('aplica los límites de longitud de contraseña en los bordes', () => {
    const at = (n: number) =>
      registerRequestSchema.safeParse({ ...validRegister, password: 'a'.repeat(n) }).success;
    expect(at(PASSWORD_MIN_LENGTH - 1)).toBe(false);
    expect(at(PASSWORD_MIN_LENGTH)).toBe(true);
    expect(at(PASSWORD_MAX_LENGTH)).toBe(true);
    expect(at(PASSWORD_MAX_LENGTH + 1)).toBe(false);
  });

  it('rechaza correos inválidos', () => {
    for (const email of ['', 'sin-arroba', 'a@', '@b.co', 'a b@c.co']) {
      expect(registerRequestSchema.safeParse({ ...validRegister, email }).success, email).toBe(
        false,
      );
    }
  });

  it('rechaza nombres vacíos tras recortar espacios', () => {
    expect(registerRequestSchema.safeParse({ ...validRegister, displayName: '   ' }).success).toBe(
      false,
    );
  });
});

describe('loginRequestSchema', () => {
  it('usa cookie como transporte por defecto', () => {
    const parsed = loginRequestSchema.parse({ email: 'a@b.co', password: 'x' });
    expect(parsed.tokenTransport).toBe('cookie');
  });

  it('no revela la política de contraseña en el login, pero limita el tamaño', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'corta' }).success).toBe(true);
    expect(
      loginRequestSchema.safeParse({
        email: 'a@b.co',
        password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe('updateSettingsRequestSchema', () => {
  it('acepta ajustes válidos', () => {
    const parsed = updateSettingsRequestSchema.parse({
      baseCurrency: 'USD',
      timezone: 'America/Bogota',
      theme: 'dark',
      locale: 'en-US',
    });
    expect(parsed.baseCurrency).toBe('USD');
  });

  it('rechaza objeto vacío, campos desconocidos, monedas y zonas inválidas', () => {
    expect(updateSettingsRequestSchema.safeParse({}).success).toBe(false);
    expect(updateSettingsRequestSchema.safeParse({ isAdmin: true }).success).toBe(false);
    expect(updateSettingsRequestSchema.safeParse({ baseCurrency: 'XXX' }).success).toBe(false);
    expect(updateSettingsRequestSchema.safeParse({ baseCurrency: 'cop' }).success).toBe(false);
    expect(updateSettingsRequestSchema.safeParse({ timezone: 'Marte/Olympus' }).success).toBe(
      false,
    );
  });
});

describe('errores', () => {
  it('cada código tiene estado HTTP y mensaje en español e inglés', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_MESSAGES[code].es.length).toBeGreaterThan(0);
      expect(ERROR_MESSAGES[code].en.length).toBeGreaterThan(0);
    }
  });

  it('ningún mensaje expone detalles técnicos', () => {
    for (const code of ERROR_CODES) {
      for (const text of Object.values(ERROR_MESSAGES[code])) {
        expect(text).not.toMatch(/500|stack|exception|prisma|sql/i);
      }
    }
  });

  it('errorMessage usa español por defecto', () => {
    expect(errorMessage('NOT_FOUND')).toBe(ERROR_MESSAGES.NOT_FOUND.es);
    expect(errorMessage('NOT_FOUND', 'en')).toBe(ERROR_MESSAGES.NOT_FOUND.en);
  });

  it('isApiErrorBody reconoce solo la forma del contrato', () => {
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } })).toBe(
      true,
    );
    expect(isApiErrorBody({ error: 'texto' })).toBe(false);
    expect(isApiErrorBody(null)).toBe(false);
    expect(isApiErrorBody({ message: 'x' })).toBe(false);
  });

  it('toFieldIssues aplana rutas anidadas', () => {
    const result = registerRequestSchema.safeParse({ ...validRegister, password: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = toFieldIssues(result.error);
      expect(issues.some((i) => i.path === 'password')).toBe(true);
    }
  });
});
