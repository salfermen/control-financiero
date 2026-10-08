import { sessions, userSettings, users } from '@cf/db';
import { createTestDatabase, getTestDatabaseUrl, resetTestDatabase } from '@cf/db/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';
import { sessionCleanupJob } from '../src/jobs/session-cleanup.js';
import { type RunningWorker, startWorker } from '../src/worker.js';

const logger = pino({ level: 'silent' });
let worker: RunningWorker | undefined;

beforeAll(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await worker?.stop();
});

describe('worker', () => {
  it('arranca pg-boss en su propio esquema y programa los jobs en hora de Bogotá', async () => {
    const config = loadWorkerConfig({
      DATABASE_URL: getTestDatabaseUrl(),
      WORKER_QUEUE_SCHEMA: 'pgboss_test',
      // Sin red externa en pruebas: la TRM se prueba con un proveedor simulado.
      FX_TRM_PROVIDER: 'disabled',
    });
    worker = await startWorker(config, logger);
    const schedules = await worker.boss.getSchedules(sessionCleanupJob.name);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      cron: sessionCleanupJob.cron,
      timezone: 'America/Bogota',
    });
  });

  it('el job de limpieza borra solo sesiones antiguas', async () => {
    const handle = createTestDatabase();
    try {
      const [user] = await handle.db
        .insert(users)
        .values({ email: 'worker@prueba.co', passwordHash: 'x', displayName: 'W' })
        .returning();
      await handle.db.insert(userSettings).values({ userId: user?.id ?? '' });
      const now = new Date('2026-10-07T08:00:00Z');
      const old = new Date(now.getTime() - 60 * 86_400_000);
      await handle.db.insert(sessions).values([
        {
          userId: user?.id ?? '',
          tokenHash: '1'.repeat(64),
          transport: 'cookie',
          createdAt: new Date(old.getTime() - 1000),
          lastUsedAt: old,
          expiresAt: old,
        },
        {
          userId: user?.id ?? '',
          tokenHash: '2'.repeat(64),
          transport: 'cookie',
          expiresAt: new Date(now.getTime() + 86_400_000),
        },
      ]);
      const result = await sessionCleanupJob.run({ db: handle.db, logger, now: () => now });
      expect(result).toEqual({ deleted: 1 });
    } finally {
      await handle.close();
    }
  });
});
