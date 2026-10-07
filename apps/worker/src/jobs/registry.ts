import type { Database } from '@cf/db';
import type { Logger } from 'pino';
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
  /** Devuelve un resumen serializable que pg-boss guarda como salida del job. */
  run(deps: JobDependencies): Promise<Record<string, number | string>>;
}

/**
 * Trabajos registrados. Cada fase añade los suyos (TRM diaria en F4,
 * recurrencias en F5, alertas en F10) sin tocar el arranque del worker.
 */
export const JOBS: readonly ScheduledJob[] = [sessionCleanupJob];
