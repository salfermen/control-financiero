import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { type DatabaseHandle } from '@cf/db';
import {
  createTestDatabase,
  getTestDatabaseUrl,
  resetTestDatabase,
  truncateUserData,
} from '@cf/db/testing';
import type { Logger as PinoLogger } from 'pino';
import { createApp } from '../src/app.factory.js';
import { createLogger } from '../src/common/logging/logger.js';
import { type AppConfig, loadConfig } from '../src/config/env.js';

export const CSRF = { 'x-csrf-protection': '1' } as const;
export const TEST_PASSWORD = 'frase-de-prueba-bastante-larga';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: getTestDatabaseUrl(),
    IP_HASH_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
    CORS_ORIGINS: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_MAX: '10000',
    AUTH_RATE_LIMIT_MAX: '10000',
    API_DOCS_ENABLED: 'true',
    ...overrides,
  });
}

export interface TestContext {
  app: NestFastifyApplication;
  db: DatabaseHandle;
  config: AppConfig;
}

/** Arranca la app real contra una base de pruebas recién migrada. */
export async function setupTestApp(
  overrides: Record<string, string> = {},
  logger: PinoLogger = createLogger('silent'),
): Promise<TestContext> {
  await resetTestDatabase();
  const config = testConfig(overrides);
  const app = await createApp(config, { logger });
  await app.getHttpAdapter().getInstance().ready();
  return { app, db: createTestDatabase(), config };
}

export async function teardownTestApp(ctx: TestContext | undefined): Promise<void> {
  await ctx?.app.close();
  await ctx?.db.close();
}

export async function resetData(ctx: TestContext): Promise<void> {
  await truncateUserData(ctx.db);
}

export function sessionCookie(
  setCookie: string | string[] | undefined,
  name = 'cf_session',
): string {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = values.find((value) => value.startsWith(`${name}=`));
  if (!match) throw new Error('La respuesta no trae cookie de sesión');
  return match.split(';')[0] ?? '';
}

let counter = 0;
export function uniqueEmail(prefix = 'persona'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@prueba.co`;
}

export async function registerUser(
  ctx: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ cookie: string; userId: string; email: string }> {
  const email = (overrides.email as string | undefined) ?? uniqueEmail();
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: CSRF,
    payload: {
      email,
      password: TEST_PASSWORD,
      displayName: 'Persona de prueba',
      acceptTerms: true,
      ...overrides,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Registro falló (${response.statusCode}): ${response.body}`);
  }
  const body = response.json<{ user: { id: string; email: string } }>();
  return {
    cookie: sessionCookie(response.headers['set-cookie']),
    userId: body.user.id,
    email: body.user.email,
  };
}
