// Deja la base E2E limpia, migrada y con datos de referencia antes de arrancar la API.
import { assertIsTestDatabase, resetTestDatabase } from '@cf/db/testing';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta E2E_DATABASE_URL (ver docs/ENVIRONMENT.md).');
  process.exit(1);
}
assertIsTestDatabase(url);
await resetTestDatabase(url);
