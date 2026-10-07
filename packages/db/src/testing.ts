/**
 * Utilidades SOLO para pruebas. Se exportan por `@cf/db/testing` y nunca desde
 * el punto de entrada principal.
 */
import { sql } from 'drizzle-orm';
import { createDatabase, type DatabaseHandle } from './client.js';
import { loadEnvFromWorkspace } from './env.js';
import { runMigrations } from './migrator.js';
import { seedReferenceData } from './seed.js';

/** Resuelve la URL de la base de pruebas y verifica que sea de pruebas. */
export function getTestDatabaseUrl(): string {
  loadEnvFromWorkspace();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta TEST_DATABASE_URL. Las pruebas de integración necesitan una base PostgreSQL dedicada (ver docs/ENVIRONMENT.md).',
    );
  }
  assertIsTestDatabase(url);
  return url;
}

/**
 * Protección contra accidentes: las pruebas borran datos, así que se niegan a
 * correr si el nombre de la base no contiene "test".
 */
export function assertIsTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) {
    throw new Error(
      `Por seguridad, las pruebas solo corren contra bases cuyo nombre contiene "test" (recibido: "${name}").`,
    );
  }
}

/** Borra todo, aplica migraciones desde cero y siembra referencia. */
export async function resetTestDatabase(url: string = getTestDatabaseUrl()): Promise<void> {
  assertIsTestDatabase(url);
  const handle = createDatabase(url, { maxConnections: 1, applicationName: 'cf-test-reset' });
  try {
    // Borra todos los esquemas de la aplicación (public, drizzle, colas de pg-boss…).
    const result = await handle.db.execute<{ name: string }>(sql`
      SELECT schema_name AS name FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg\_%' AND schema_name <> 'information_schema'
    `);
    for (const { name } of result.rows) {
      await handle.db.execute(
        sql.raw(`DROP SCHEMA IF EXISTS "${name.replace(/"/g, '""')}" CASCADE`),
      );
    }
    await handle.db.execute(sql`CREATE SCHEMA public`);
    await runMigrations(handle.db);
    await seedReferenceData(handle.db);
  } finally {
    await handle.close();
  }
}

/** Vacía las tablas con datos de usuario conservando la referencia sembrada. */
export async function truncateUserData(handle: DatabaseHandle): Promise<void> {
  // Sin CASCADE: un TRUNCATE en cascada sobre `users` vaciaría también las
  // categorías del sistema (comparten tabla con las del usuario).
  await handle.db.execute(sql`
    TRUNCATE TABLE transactions, accounts, exchange_rates, audit_logs, consents, sessions,
      user_settings
  `);
  await handle.db.execute(sql`DELETE FROM categories WHERE user_id IS NOT NULL`);
  await handle.db.execute(sql`DELETE FROM users`);
}

export function createTestDatabase(): DatabaseHandle {
  return createDatabase(getTestDatabaseUrl(), { maxConnections: 4, applicationName: 'cf-test' });
}
