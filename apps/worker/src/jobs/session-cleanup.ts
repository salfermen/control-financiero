import { purgeStaleSessions } from '@cf/db';
import type { ScheduledJob } from './registry.js';

/** Margen antes de borrar sesiones vencidas o revocadas (útil para investigar incidentes). */
export const SESSION_RETENTION_DAYS = 30;

export const sessionCleanupJob: ScheduledJob = {
  name: 'maintenance.session-cleanup',
  // Todos los días a las 03:17 (hora de la zona configurada).
  cron: '17 3 * * *',
  description: 'Borra sesiones vencidas o revocadas hace más de 30 días.',
  async run({ db, logger, now }) {
    const deleted = await purgeStaleSessions(db, now(), SESSION_RETENTION_DAYS);
    logger.info({ job: 'maintenance.session-cleanup', deleted }, 'Sesiones antiguas purgadas');
    return { deleted };
  },
};
