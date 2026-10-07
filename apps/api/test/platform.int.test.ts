import { accounts, auditLogs, categories, transactions } from '@cf/db';
import {
  apiErrorBodySchema,
  categoryDtoSchema,
  currencyDtoSchema,
  healthDtoSchema,
  listOf,
  userDtoSchema,
} from '@cf/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory.js';
import { createLogger } from '../src/common/logging/logger.js';
import {
  CSRF,
  type TestContext,
  registerUser,
  resetData,
  setupTestApp,
  teardownTestApp,
  testConfig,
} from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await teardownTestApp(ctx);
});
beforeEach(async () => {
  await resetData(ctx);
});

describe('perfil y ajustes', () => {
  it('GET /me cumple el contrato', async () => {
    const { cookie, userId } = await registerUser(ctx);
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(userDtoSchema.parse(response.json()).id).toBe(userId);
  });

  it('actualiza ajustes y lo audita sin guardar valores', async () => {
    const { cookie, userId } = await registerUser(ctx);
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/settings',
      headers: { cookie, ...CSRF },
      payload: { theme: 'dark', locale: 'en-US', timezone: 'Europe/Madrid' },
    });
    expect(response.statusCode).toBe(200);
    expect(userDtoSchema.parse(response.json()).settings).toMatchObject({
      theme: 'dark',
      locale: 'en-US',
      timezone: 'Europe/Madrid',
    });
    const [event] = await ctx.db.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'settings_updated'));
    expect(event?.userId).toBe(userId);
    expect(event?.metadata).toEqual({ fields: 'locale,theme,timezone' });
  });

  it.each([{}, { timezone: 'Luna/Base' }, { baseCurrency: 'XYZ' }, { isAdmin: true }])(
    'rechaza ajustes inválidos %j',
    async (payload) => {
      const { cookie } = await registerUser(ctx);
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/settings',
        headers: { cookie, ...CSRF },
        payload,
      });
      expect(response.statusCode).toBe(400);
    },
  );

  it('permite cambiar la moneda base solo mientras no haya movimientos', async () => {
    const { cookie, userId } = await registerUser(ctx);
    const change = (baseCurrency: string) =>
      ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/settings',
        headers: { cookie, ...CSRF },
        payload: { baseCurrency },
      });
    expect((await change('USD')).statusCode).toBe(200);
    expect((await change('COP')).statusCode).toBe(200);

    const [account] = await ctx.db.db
      .insert(accounts)
      .values({
        userId,
        name: 'Efectivo',
        type: 'cash',
        currency: 'COP',
        openingBalanceDate: '2026-10-01',
      })
      .returning();
    await ctx.db.db.insert(transactions).values({
      userId,
      accountId: account?.id ?? '',
      accountCurrency: 'COP',
      type: 'expense',
      direction: 'outflow',
      transactionDate: '2026-10-07',
      description: 'Café',
      amount: '8000',
      originalAmount: '8000',
      originalCurrency: 'COP',
      baseCurrency: 'COP',
      baseAmount: '8000',
    });

    const blocked = await change('USD');
    expect(blocked.statusCode).toBe(409);
    expect(apiErrorBodySchema.parse(blocked.json()).error.code).toBe('BASE_CURRENCY_LOCKED');
    // Repetir la misma moneda no es un cambio y no se bloquea.
    expect((await change('COP')).statusCode).toBe(200);
  });
});

describe('datos de referencia', () => {
  it('las monedas son públicas y cumplen el contrato', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/currencies' });
    expect(response.statusCode).toBe(200);
    const { data } = listOf(currencyDtoSchema).parse(response.json());
    expect(data).toHaveLength(14);
    expect(data.find((c) => c.code === 'COP')).toMatchObject({ minorUnit: 2, displayDecimals: 0 });
  });

  it('las categorías se traducen y cada usuario ve solo las suyas', async () => {
    const ana = await registerUser(ctx);
    const luis = await registerUser(ctx);
    await ctx.db.db
      .insert(categories)
      .values({ userId: luis.userId, kind: 'expense', name: 'Mascotas' });

    const list = async (cookie: string) => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/categories',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      return listOf(categoryDtoSchema).parse(response.json()).data;
    };

    const anaCats = await list(ana.cookie);
    expect(anaCats).toHaveLength(23);
    expect(anaCats.some((c) => c.name === 'Mascotas')).toBe(false);
    expect(anaCats.find((c) => c.systemKey === 'video_games')?.name).toBe('Videojuegos');

    const luisCats = await list(luis.cookie);
    expect(luisCats.find((c) => c.name === 'Mascotas')?.isSystem).toBe(false);

    await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/settings',
      headers: { cookie: ana.cookie, ...CSRF },
      payload: { locale: 'en-US' },
    });
    expect((await list(ana.cookie)).find((c) => c.systemKey === 'video_games')?.name).toBe(
      'Video games',
    );
  });
});

describe('errores con formato estándar', () => {
  it('ruta inexistente → NOT_FOUND en el idioma pedido', async () => {
    const es = await ctx.app.inject({ method: 'GET', url: '/api/v1/no-existe' });
    expect(es.statusCode).toBe(404);
    expect(apiErrorBodySchema.parse(es.json()).error.message).toBe('No encontramos lo que buscas.');
    const en = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/no-existe',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    expect(apiErrorBodySchema.parse(en.json()).error.message).toBe(
      'We could not find what you are looking for.',
    );
  });

  it('JSON mal formado → VALIDATION_ERROR', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...CSRF, 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorBodySchema.parse(response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('cuerpo de más de 1 MB → PAYLOAD_TOO_LARGE', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...CSRF, 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(1_100_000) }),
    });
    expect(response.statusCode).toBe(413);
    expect(apiErrorBodySchema.parse(response.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('nunca expone stack traces', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(response.body).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
  });
});

describe('salud y documentación', () => {
  it('live y ready responden con la base disponible', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health/live' })).json()).toEqual({
      status: 'ok',
    });
    const ready = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(healthDtoSchema.parse(ready.json())).toMatchObject({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('ready responde 503 si PostgreSQL no está disponible', async () => {
    const config = testConfig({
      DATABASE_URL: 'postgresql://nadie:nada@127.0.0.1:1/test_inexistente',
    });
    const app = await createApp(config, { logger: createLogger('silent') });
    try {
      const ready = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(ready.statusCode).toBe(503);
      expect(healthDtoSchema.parse(ready.json())).toMatchObject({
        status: 'degraded',
        checks: { database: 'down' },
      });
    } finally {
      await app.close();
    }
  });

  it('publica OpenAPI con las rutas y la seguridad documentadas', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/docs/openapi.json' });
    expect(response.statusCode).toBe(200);
    const doc = response.json<{
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    }>();
    for (const path of [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/me',
      '/api/v1/categories',
      '/health/ready',
    ]) {
      expect(doc.paths[path], path).toBeDefined();
    }
    expect(Object.keys(doc.components.securitySchemes)).toEqual(
      expect.arrayContaining(['cookie', 'bearer']),
    );
  });

  it('la documentación se puede desactivar', async () => {
    const app = await createApp(testConfig({ API_DOCS_ENABLED: 'false' }), {
      logger: createLogger('silent'),
    });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/docs/openapi.json' })).statusCode).toBe(
        404,
      );
    } finally {
      await app.close();
    }
  });
});
