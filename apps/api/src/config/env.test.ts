import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:secreto-db@localhost:5432/finanzas',
  IP_HASH_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('aplica valores por defecto seguros', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      SESSION_TTL_DAYS: 30,
      SESSION_IDLE_DAYS: 7,
      SESSION_COOKIE_SECURE: false,
      API_DOCS_ENABLED: true,
      CORS_ORIGINS: ['http://localhost:3000'],
      TRUST_PROXY: false,
    });
  });

  it('en producción exige cookie Secure y apaga la documentación por defecto', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'production' });
    expect(config.SESSION_COOKIE_SECURE).toBe(true);
    expect(config.API_DOCS_ENABLED).toBe(false);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }),
    ).toThrow(/SESSION_COOKIE_SECURE/);
  });

  it('separa la lista de orígenes CORS', () => {
    const config = loadConfig({
      ...base,
      CORS_ORIGINS: 'https://app.ejemplo.co, https://admin.ejemplo.co',
    });
    expect(config.CORS_ORIGINS).toEqual(['https://app.ejemplo.co', 'https://admin.ejemplo.co']);
  });

  it('falla con un mensaje que nombra la variable pero no revela su valor', () => {
    try {
      loadConfig({ DATABASE_URL: 'mysql://u:clave-secreta@h/db', IP_HASH_SECRET: 'corto' });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('IP_HASH_SECRET');
      expect(message).not.toContain('clave-secreta');
      expect(message).not.toContain('corto');
    }
  });

  it('exige DATABASE_URL', () => {
    expect(() => loadConfig({ IP_HASH_SECRET: 'x'.repeat(32) })).toThrow(/DATABASE_URL/);
  });

  it('no permite inactividad mayor que la vida de la sesión', () => {
    expect(() => loadConfig({ ...base, SESSION_TTL_DAYS: '5', SESSION_IDLE_DAYS: '10' })).toThrow(
      /SESSION_IDLE_DAYS/,
    );
  });

  it('interpreta TRUST_PROXY como booleano o lista de IPs/CIDR', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(true);
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: '127.0.0.1, ::1,10.0.0.0/8' }).TRUST_PROXY).toEqual([
      '127.0.0.1',
      '::1',
      '10.0.0.0/8',
    ]);
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'si' })).toThrow(/TRUST_PROXY/);
  });

  it('valida booleanos explícitos', () => {
    expect(() => loadConfig({ ...base, API_DOCS_ENABLED: 'quizas' })).toThrow(/API_DOCS_ENABLED/);
  });
});
