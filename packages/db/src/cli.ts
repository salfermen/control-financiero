/**
 * CLI mínima de base de datos para entornos sin drizzle-kit (CI, producción).
 *
 *   node dist/cli.js migrate   Aplica migraciones pendientes.
 *   node dist/cli.js seed      Siembra datos de referencia (idempotente).
 *   node dist/cli.js setup     migrate + seed.
 */
import { createDatabase } from './client.js';
import { loadEnvFromWorkspace, requireEnv } from './env.js';
import { runMigrations } from './migrator.js';
import { seedReferenceData } from './seed.js';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || !['migrate', 'seed', 'setup'].includes(command)) {
    console.error('Uso: node dist/cli.js <migrate|seed|setup>');
    process.exitCode = 2;
    return;
  }

  loadEnvFromWorkspace();
  const handle = createDatabase(requireEnv('DATABASE_URL'), {
    maxConnections: 1,
    applicationName: 'cf-db-cli',
  });

  try {
    if (command === 'migrate' || command === 'setup') {
      await runMigrations(handle.db);
      console.log('Migraciones aplicadas.');
    }
    if (command === 'seed' || command === 'setup') {
      const result = await seedReferenceData(handle.db);
      console.log(
        `Datos de referencia sembrados: ${result.currencies} monedas, ${result.categories} categorías.`,
      );
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  // Nunca imprimir la URL de conexión: puede contener la contraseña.
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `Error de base de datos: ${message.replace(/postgres(ql)?:\/\/\S+/gi, '[url oculta]')}`,
  );
  process.exitCode = 1;
});
