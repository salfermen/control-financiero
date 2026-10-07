import 'reflect-metadata';
import { loadEnvFromWorkspace } from '@cf/db';
import { createApp } from './app.factory.js';
import { createLogger } from './common/logging/logger.js';
import { loadConfig } from './config/env.js';

async function bootstrap(): Promise<void> {
  loadEnvFromWorkspace();
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const app = await createApp(config, { logger });
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  logger.info(
    { host: config.API_HOST, port: config.API_PORT, docs: config.API_DOCS_ENABLED },
    'API lista',
  );
}

bootstrap().catch((error: unknown) => {
  // Error de arranque (p. ej. configuración inválida): mensaje claro y salida con código 1.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
