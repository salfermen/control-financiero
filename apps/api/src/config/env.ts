import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * Variables de entorno de la API, validadas al arrancar (fallo inmediato y
 * explícito si falta algo). Documentadas en docs/ENVIRONMENT.md y .env.example.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_VERSION: z.string().default('0.1.0'),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /** Orígenes del navegador autorizados (separados por coma). */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
    /**
     * Proxies de confianza para leer la IP real desde X-Forwarded-For:
     * `false` (por defecto), `true` (cualquiera; NO recomendado) o una lista de
     * IPs/CIDR separadas por coma, p. ej. `127.0.0.1,::1` para el proxy de la web.
     */
    TRUST_PROXY: z
      .string()
      .default('false')
      .transform((value): boolean | string[] => {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'false' || normalized === '0' || normalized === '') return false;
        if (normalized === 'true' || normalized === '1') return true;
        return value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      })
      .refine(
        (value) =>
          typeof value === 'boolean' ||
          value.every((entry) => /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(entry)),
        'TRUST_PROXY debe ser true, false o una lista de IPs/CIDR.',
      ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('cf_session'),
    SESSION_COOKIE_SECURE: booleanFromString.optional(),
    /** Vida máxima de una sesión. */
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Una sesión sin uso durante este tiempo se considera expirada. */
    SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    /** Secreto para seudonimizar IPs (HMAC). Mínimo 32 caracteres. */
    IP_HASH_SECRET: z.string().min(32, 'IP_HASH_SECRET debe tener al menos 32 caracteres.'),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    API_DOCS_ENABLED: booleanFromString.optional(),
  })
  .transform((env) => ({
    ...env,
    SESSION_COOKIE_SECURE: env.SESSION_COOKIE_SECURE ?? env.NODE_ENV === 'production',
    API_DOCS_ENABLED: env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production',
  }))
  .superRefine((env, ctx) => {
    if (env.SESSION_IDLE_DAYS > env.SESSION_TTL_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_IDLE_DAYS'],
        message: 'SESSION_IDLE_DAYS no puede superar SESSION_TTL_DAYS.',
      });
    }
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'En producción la cookie de sesión debe ser Secure.',
      });
    }
  });

export type AppConfig = z.output<typeof envSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Valida el entorno. El mensaje de error lista las variables inválidas, nunca
 * sus valores (podrían ser secretos).
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(entorno)'}: ${issue.message}`,
    );
    throw new Error(`Configuración inválida de la API:\n${lines.join('\n')}`);
  }
  return result.data;
}
