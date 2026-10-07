/**
 * @cf/db — esquema, cliente, migraciones y datos de referencia.
 *
 * Única puerta de acceso a PostgreSQL. Las apps importan desde aquí; ningún
 * otro paquete define tablas.
 */
export * from './client.js';
export * from './env.js';
export * from './maintenance.js';
export * from './migrator.js';
export * from './seed.js';
export * from './uuid.js';
export * as schema from './schema/index.js';
export * from './schema/index.js';
