import { lt, or } from 'drizzle-orm';
import type { Database } from './client.js';
import { sessions } from './schema/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Borra sesiones vencidas o revocadas hace más de `graceDays` días. Mantener un
 * margen permite investigar incidentes recientes con la tabla de sesiones.
 * Lo ejecuta el worker a diario.
 */
export async function purgeStaleSessions(
  db: Database,
  now: Date = new Date(),
  graceDays = 30,
): Promise<number> {
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    throw new RangeError('graceDays debe ser un entero no negativo');
  }
  const threshold = new Date(now.getTime() - graceDays * DAY_MS);
  const deleted = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, threshold), lt(sessions.revokedAt, threshold)))
    .returning({ id: sessions.id });
  return deleted.length;
}
