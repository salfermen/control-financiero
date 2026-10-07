import { z } from 'zod';

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Zona horaria en la que se evalúan las expresiones cron. */
  WORKER_TIMEZONE: z.string().default('America/Bogota'),
  /** Esquema propio de pg-boss, separado de las tablas de negocio. */
  WORKER_QUEUE_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .default('pgboss'),
});

export type WorkerConfig = z.output<typeof workerEnvSchema>;

export function loadWorkerConfig(source: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida del worker:\n${lines.join('\n')}`);
  }
  return result.data;
}
