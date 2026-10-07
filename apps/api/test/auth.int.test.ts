import { auditLogs, consents, sessions, users } from '@cf/db';
import { CURRENT_TERMS_VERSION, apiErrorBodySchema, authResponseDtoSchema } from '@cf/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/common/security/crypto.js';
import {
  CSRF,
  TEST_PASSWORD,
  type TestContext,
  registerUser,
  resetData,
  sessionCookie,
  setupTestApp,
  teardownTestApp,
  uniqueEmail,
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

const login = (payload: Record<string, unknown>, headers: Record<string, string> = CSRF) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload });

const audit = (action: string) =>
  ctx.db.db.select().from(auditLogs).where(eq(auditLogs.action, action));

describe('registro', () => {
  it('crea la cuenta, normaliza el correo, guarda consentimiento y abre sesión por cookie', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: CSRF,
      payload: {
        email: '  Maria.Lopez@Correo.CO ',
        password: TEST_PASSWORD,
        displayName: 'María',
        acceptTerms: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = authResponseDtoSchema.parse(response.json());
    expect(body.token).toBeUndefined();
    expect(body.user.email).toBe('maria.lopez@correo.co');
    expect(body.user.settings).toEqual({
      baseCurrency: 'COP',
      locale: 'es-CO',
      timezone: 'America/Bogota',
      theme: 'system',
    });

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/^cf_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(response.headers['cache-control']).toBe('no-store');

    const [user] = await ctx.db.db.select().from(users).where(eq(users.id, body.user.id));
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user?.passwordHash).not.toContain(TEST_PASSWORD);

    const granted = await ctx.db.db
      .select()
      .from(consents)
      .where(eq(consents.userId, body.user.id));
    expect(granted.map((c) => c.type).sort()).toEqual(['privacy_policy', 'terms_of_service']);
    expect(
      granted.every((c) => c.version === CURRENT_TERMS_VERSION && c.ipHash?.length === 64),
    ).toBe(true);

    expect(await audit('user_registered')).toHaveLength(1);
  });

  it('rechaza un correo ya registrado aunque cambien mayúsculas', async () => {
    await registerUser(ctx, { email: 'repetido@prueba.co' });
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: CSRF,
      payload: {
        email: 'REPETIDO@prueba.co',
        password: TEST_PASSWORD,
        displayName: 'X',
        acceptTerms: true,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    [{ acceptTerms: false }, 'acceptTerms'],
    [{ password: 'corta' }, 'password'],
    [{ email: 'no-es-correo' }, 'email'],
    [{ displayName: '   ' }, 'displayName'],
    [{ email: 'carolina@prueba.co', password: 'mi-clave-carolina-123' }, 'password'],
  ])('valida la entrada %j', async (overrides, field) => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: CSRF,
      payload: {
        email: uniqueEmail(),
        password: TEST_PASSWORD,
        displayName: 'X',
        acceptTerms: true,
        ...overrides,
      },
    });
    expect(response.statusCode).toBe(400);
    const body = apiErrorBodySchema.parse(response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.issues?.some((issue) => issue.path === field)).toBe(true);
  });
});

describe('inicio y cierre de sesión', () => {
  it('login web: cookie de sesión válida y token guardado solo como hash', async () => {
    const { email, userId } = await registerUser(ctx);
    const response = await login({ email, password: TEST_PASSWORD });
    expect(response.statusCode).toBe(200);
    const cookie = sessionCookie(response.headers['set-cookie']);
    const token = cookie.split('=')[1] ?? '';

    const stored = await ctx.db.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.transport, 'cookie')));
    expect(stored.some((s) => s.tokenHash === sha256Hex(token))).toBe(true);
    expect(stored.every((s) => s.tokenHash !== token)).toBe(true);

    const session = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json<{ user: { id: string } }>().user.id).toBe(userId);
    expect((await audit('login_succeeded')).length).toBe(1);
  });

  it('login móvil: token bearer una sola vez en el cuerpo y sin cookie', async () => {
    const { email } = await registerUser(ctx);
    const response = await login({ email, password: TEST_PASSWORD, tokenTransport: 'bearer' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    const body = authResponseDtoSchema.parse(response.json());
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.session.transport).toBe('bearer');

    // Con bearer no se exige la cabecera anti-CSRF.
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me/settings',
      headers: { authorization: `Bearer ${body.token}` },
      payload: { theme: 'dark' },
    });
    expect(patch.statusCode).toBe(200);
  });

  it('credenciales incorrectas y correo inexistente responden igual', async () => {
    const { email } = await registerUser(ctx);
    const wrong = await login({ email, password: 'otra-clave-equivocada' });
    const unknown = await login({ email: 'nadie@prueba.co', password: 'otra-clave-equivocada' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json<{ error: { code: string; message: string } }>().error.message).toBe(
      unknown.json<{ error: { message: string } }>().error.message,
    );
    const failed = await audit('login_failed');
    expect(failed.map((row) => row.metadata.reason).sort()).toEqual([
      'bad_password',
      'unknown_email',
    ]);
  });

  it('bloquea tras 5 intentos fallidos, incluso con la clave correcta, y se libera al vencer', async () => {
    const { email, userId } = await registerUser(ctx);
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await login({ email, password: `incorrecta-${attempt}-xxxx` })).statusCode).toBe(401);
    }
    const locked = await login({ email, password: TEST_PASSWORD });
    expect(locked.statusCode).toBe(423);
    expect(locked.json<{ error: { code: string } }>().error.code).toBe('ACCOUNT_LOCKED');
    expect(await audit('account_locked')).toHaveLength(1);

    await ctx.db.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, userId));
    expect((await login({ email, password: TEST_PASSWORD })).statusCode).toBe(200);
    const [user] = await ctx.db.db.select().from(users).where(eq(users.id, userId));
    expect(user?.failedLoginCount).toBe(0);
    expect(user?.lockedUntil).toBeNull();
  });

  it('logout revoca la sesión y borra la cookie', async () => {
    const { cookie } = await registerUser(ctx);
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie, ...CSRF },
    });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).toMatch(/cf_session=;/);
    const after = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('logout-all revoca las sesiones de todos los dispositivos', async () => {
    const { cookie, email } = await registerUser(ctx);
    const mobile = await login({ email, password: TEST_PASSWORD, tokenTransport: 'bearer' });
    const token = authResponseDtoSchema.parse(mobile.json()).token ?? '';

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: { cookie, ...CSRF },
    });
    expect(response.statusCode).toBe(204);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).statusCode,
    ).toBe(401);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/api/v1/me',
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe('validez de la sesión', () => {
  it.each([
    [
      'vencida',
      { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 10_000) },
    ],
    ['inactiva más de 7 días', { lastUsedAt: new Date(Date.now() - 8 * 86_400_000) }],
    ['revocada', { revokedAt: new Date() }],
  ])('rechaza una sesión %s', async (_label, patch) => {
    const { cookie, userId } = await registerUser(ctx);
    await ctx.db.db.update(sessions).set(patch).where(eq(sessions.userId, userId));
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rechaza la sesión de un usuario deshabilitado', async () => {
    const { cookie, userId } = await registerUser(ctx);
    await ctx.db.db.update(users).set({ status: 'disabled' }).where(eq(users.id, userId));
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).statusCode,
    ).toBe(401);
  });

  it.each(['Bearer', 'Basic abc', 'Bearer token-con-formato-invalido', `Bearer ${'a'.repeat(43)}`])(
    'rechaza la cabecera Authorization %s',
    async (authorization) => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');
    },
  );
});
