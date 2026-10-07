import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  readonly pool: Pool;
  /** Cierra todas las conexiones del pool. */
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  /** Conexiones máximas del pool. */
  maxConnections?: number;
  /** Nombre visible en `pg_stat_activity`, útil para diagnosticar. */
  applicationName?: string;
  /** Tiempo máximo por sentencia en ms (protege contra consultas colgadas). */
  statementTimeoutMs?: number;
}

export function createDatabase(url: string, options: CreateDatabaseOptions = {}): DatabaseHandle {
  if (!url) {
    throw new Error('DATABASE_URL no está definida.');
  }
  const config: PoolConfig = {
    connectionString: url,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? 'control-financiero',
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  };
  if (options.statementTimeoutMs !== undefined) {
    config.statement_timeout = options.statementTimeoutMs;
  }
  const pool = new Pool(config);
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}
