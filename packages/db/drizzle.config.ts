import { defineConfig } from 'drizzle-kit';
import { loadEnvFromWorkspace } from './src/env.js';

loadEnvFromWorkspace(import.meta.dirname);

/**
 * `drizzle-kit generate` compara el esquema TypeScript con las migraciones
 * existentes y escribe una nueva migración SQL en ./migrations (no necesita base).
 * `migrate`, `check` y `studio` usan DATABASE_URL.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
