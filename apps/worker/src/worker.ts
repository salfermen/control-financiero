import { createDatabase, type DatabaseHandle } from '@cf/db';
import { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';
import type { WorkerConfig } from './config.js';
import { type ScheduledJob, buildJobs } from './jobs/registry.js';

export interface RunningWorker {
  boss: PgBoss;
  database: DatabaseHandle;
  stop(): Promise<void>;
}

/**
 * Arranca pg-boss, crea las colas, registra los horarios y los manejadores.
 * Un fallo en un job se registra y pg-boss lo reintenta; nunca se silencia.
 */
export async function startWorker(
  config: WorkerConfig,
  logger: Logger,
  jobs: readonly ScheduledJob[] = buildJobs(config),
): Promise<RunningWorker> {
  const database = createDatabase(config.DATABASE_URL, {
    maxConnections: 3,
    applicationName: 'cf-worker',
  });
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    schema: config.WORKER_QUEUE_SCHEMA,
    application_name: 'cf-worker-queue',
  });
  boss.on('error', (error: unknown) => logger.error({ err: error }, 'Error de pg-boss'));

  await boss.start();

  for (const job of jobs) {
    await boss.createQueue(job.name, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
    await boss.schedule(job.name, job.cron, null, { tz: config.WORKER_TIMEZONE });
    await boss.work(job.name, async () => {
      const startedAt = Date.now();
      try {
        const result = await job.run({ db: database.db, logger, now: () => new Date() });
        logger.info({ job: job.name, ms: Date.now() - startedAt, result }, 'Job completado');
        return result;
      } catch (error) {
        logger.error({ job: job.name, err: error }, 'Job fallido; pg-boss lo reintentará');
        throw error;
      }
    });
    logger.info({ job: job.name, cron: job.cron, tz: config.WORKER_TIMEZONE }, 'Job programado');
    if (job.runOnStart) {
      // singletonKey evita encolar dos ejecuciones si el worker se reinicia seguido.
      await boss.send(job.name, null, {
        singletonKey: `${job.name}:startup`,
        singletonSeconds: 300,
      });
    }
  }

  return {
    boss,
    database,
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
      await database.close();
    },
  };
}
