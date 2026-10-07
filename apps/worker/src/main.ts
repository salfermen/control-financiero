import { loadEnvFromWorkspace } from '@cf/db';
import { pino } from 'pino';
import { loadWorkerConfig } from './config.js';
import { startWorker } from './worker.js';

async function main(): Promise<void> {
  loadEnvFromWorkspace();
  const config = loadWorkerConfig();
  const logger = pino({
    level: config.LOG_LEVEL,
    base: { service: 'worker' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  const worker = await startWorker(config, logger);
  logger.info('Worker listo');

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Deteniendo worker…');
    worker
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Error al detener el worker');
        process.exit(1);
      });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
