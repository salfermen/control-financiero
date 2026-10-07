import type { LoggerService } from '@nestjs/common';
import { pino, type Logger as PinoLogger } from 'pino';

/**
 * Rutas que nunca deben aparecer en los logs (§50 de las instrucciones):
 * contraseñas, tokens, cookies y cabeceras de autorización.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'token',
  'passwordHash',
  'tokenHash',
  '*.password',
  '*.token',
  '*.passwordHash',
  '*.tokenHash',
];

export function createLogger(level: string): PinoLogger {
  return pino({
    level,
    base: { service: 'api' },
    redact: { paths: REDACTED_PATHS, censor: '[oculto]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/** Adaptador para que Nest escriba en el mismo logger estructurado. */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }
  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context }, String(message));
  }
}
