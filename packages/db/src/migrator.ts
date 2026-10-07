import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.js';

/** Carpeta de migraciones SQL versionadas (generadas con drizzle-kit). */
export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * Aplica las migraciones pendientes dentro de una transacción. drizzle registra
 * las aplicadas en `drizzle.__drizzle_migrations`, así que es seguro repetirlo.
 */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
