import { Writable } from 'node:stream';
import { apiErrorBodySchema } from '@cf/shared';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from '../src/common/logging/logger.js';
import {
  CSRF,
  TEST_PASSWORD,
  type TestContext,
  registerUser,
  setupTestApp,
  teardownTestApp,
  uniqueEmail,
} from './helpers.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('cabeceras, CSRF y CORS', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  it('rechaza peticiones que modifican datos sin la cabecera anti-CSRF', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: uniqueEmail(),
        password: TEST_PASSWORD,
        displayName: 'X',
        acceptTerms: true,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(apiErrorBodySchema.parse(response.json()).error.code).toBe('CSRF_REJECTED');
  });

  it('también protege las rutas autenticadas por cookie', async () => {
    const { cookie } = await registerUser(ctx);
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/settings',
      headers: { cookie },
      payload: { theme: 'dark' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('envía cabeceras de seguridad y un identificador de petición en toda respuesta', async () => {
    for (const url of ['/health/live', '/api/v1/no-existe']) {
      const response = await ctx.app.inject({ method: 'GET', url });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(String(response.headers['content-security-policy'])).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(String(response.headers['x-request-id'])).toMatch(UUID_V7);
    }
  });

  it('el requestId del cuerpo de error coincide con la cabecera', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/me' });
    const body = apiErrorBodySchema.parse(response.json());
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('CORS solo autoriza los orígenes configurados', async () => {
    const preflight = (origin: string) =>
      ctx.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-csrf-protection',
        },
      });
    const allowed = await preflight('http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await preflight('https://sitio-malicioso.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('todas las rutas de datos exigen sesión', async () => {
    for (const url of ['/api/v1/me', '/api/v1/categories', '/api/v1/auth/session']) {
      const response = await ctx.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
  });
});

describe('límite de peticiones', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setupTestApp({ AUTH_RATE_LIMIT_MAX: '3', RATE_LIMIT_MAX: '1000' });
  });
  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  it('limita los intentos de autenticación por IP sin afectar al resto de la API', async () => {
    const attempt = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: CSRF,
        payload: { email: 'nadie@prueba.co', password: 'cualquiera' },
      });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    expect(apiErrorBodySchema.parse(limited.json()).error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();

    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/currencies' })).statusCode).toBe(
      200,
    );
  });

  it('consultar la sesión no consume el cupo de intentos de autenticación', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/session' });
      expect(response.statusCode).toBe(401);
    }
  });
});

describe('IP real detrás de un proxy de confianza', () => {
  const attempt = (app: TestContext['app'], forwardedFor: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...CSRF, 'x-forwarded-for': forwardedFor },
      payload: { email: 'nadie@prueba.co', password: 'cualquiera' },
    });

  it('sin TRUST_PROXY ignora X-Forwarded-For (no se puede falsear para evadir el límite)', async () => {
    const ctx = await setupTestApp({ AUTH_RATE_LIMIT_MAX: '2' });
    try {
      expect((await attempt(ctx.app, '1.1.1.1')).statusCode).toBe(401);
      expect((await attempt(ctx.app, '2.2.2.2')).statusCode).toBe(401);
      expect((await attempt(ctx.app, '3.3.3.3')).statusCode).toBe(429);
    } finally {
      await teardownTestApp(ctx);
    }
  });

  it('con el proxy en TRUST_PROXY usa la IP del cliente reenviada', async () => {
    const ctx = await setupTestApp({ AUTH_RATE_LIMIT_MAX: '2', TRUST_PROXY: '127.0.0.1,::1' });
    try {
      expect((await attempt(ctx.app, '1.1.1.1')).statusCode).toBe(401);
      expect((await attempt(ctx.app, '1.1.1.1')).statusCode).toBe(401);
      expect((await attempt(ctx.app, '1.1.1.1')).statusCode).toBe(429);
      expect((await attempt(ctx.app, '2.2.2.2')).statusCode).toBe(401);
    } finally {
      await teardownTestApp(ctx);
    }
  });
});

describe('logs', () => {
  let ctx: TestContext;
  const lines: string[] = [];
  beforeAll(async () => {
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString('utf8'));
        callback();
      },
    });
    const logger = pino(
      { level: 'trace', redact: { paths: REDACTED_PATHS, censor: '[oculto]' } },
      sink,
    );
    ctx = await setupTestApp({}, logger);
  });
  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  it('no registran contraseñas, cookies ni tokens', async () => {
    const { cookie } = await registerUser(ctx);
    await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    const output = lines.join('\n');
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain(TEST_PASSWORD);
    expect(output).not.toContain(cookie.split('=')[1] ?? '__');
  });
});
