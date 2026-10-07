/**
 * Exporta el documento OpenAPI a apps/api/openapi.json sin abrir el puerto.
 * Base para generar el cliente tipado de web y móvil.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFromWorkspace } from '@cf/db';
import { createApp } from '../app.factory.js';
import { createLogger } from '../common/logging/logger.js';
import { buildOpenApiDocument } from '../common/openapi/setup.js';
import { loadConfig } from '../config/env.js';

async function main(): Promise<void> {
  loadEnvFromWorkspace();
  const config = loadConfig({ ...process.env, API_DOCS_ENABLED: 'false' });
  const app = await createApp(config, { logger: createLogger('silent') });
  try {
    const document = buildOpenApiDocument(app, config);
    const target = path.resolve(import.meta.dirname, '../../openapi.json');
    writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`OpenAPI exportado en ${target}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
