import type { Database } from '@cf/db';
import type { Logger } from 'pino';
import type { WorkerConfig } from '../config.js';
import { DatosGovCoTrmProvider } from '../integrations/fx/datos-gov-co-trm.js';
import { fxTrmSyncJob } from './fx-trm-sync.js';
import { sessionCleanupJob } from './session-cleanup.js';

export interface JobDependencies {
  db: Database;
  logger: Logger;
  now: () => Date;
}

export interface ScheduledJob {
  /** Nombre de la cola en pg-boss (`dominio.accion`). */
  name: string;
  /** Expresión cron de 5 campos, evaluada en `timezone`. */
  cron: string;
  description: string;
  /** Si es `true`, se encola una ejecución al arrancar el worker (p. ej. traer la TRM ya). */
  runOnStart?: boolean;
  /** Devuelve un resumen serializable que pg-boss guarda como salida del job. */
  run(deps: JobDependencies): Promise<Record<string, number | string>>;
}

/**
 * Trabajos activos según la configuración. Cada fase añade los suyos
 * (recurrencias en F5, alertas en F10) sin tocar el arranque del worker.
 */
export function buildJobs(config: WorkerConfig): ScheduledJob[] {
  const jobs: ScheduledJob[] = [sessionCleanupJob];
  if (config.FX_TRM_PROVIDER === 'datos-gov-co') {
    jobs.push(
      fxTrmSyncJob(
        new DatosGovCoTrmProvider({
          url: config.FX_TRM_URL,
          appToken: config.FX_TRM_APP_TOKEN,
          timeoutMs: config.FX_TRM_TIMEOUT_MS,
        }),
        config.WORKER_TIMEZONE,
      ),
    );
  }
  return jobs;
}
