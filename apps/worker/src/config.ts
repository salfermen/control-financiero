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
  /**
   * Fuente de la TRM oficial. `datos-gov-co`: datos abiertos del Gobierno
   * (Superintendencia Financiera), sin credenciales. `disabled`: no se
   * sincroniza (las conversiones automáticas quedan sin tasa).
   */
  FX_TRM_PROVIDER: z.enum(['datos-gov-co', 'disabled']).default('datos-gov-co'),
  FX_TRM_URL: z.url({ protocol: /^https$/ }).optional(),
  /** Token de aplicación de Socrata (opcional). Nunca se registra en logs. */
  FX_TRM_APP_TOKEN: z.string().min(1).optional(),
  FX_TRM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
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
