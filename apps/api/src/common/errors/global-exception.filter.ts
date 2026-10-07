import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import { type ApiErrorBody, errorMessage } from '@cf/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './app-error.js';
import { languageFrom, mapError } from './error-mapping.js';

/**
 * Filtro global: TODA respuesta de error sale con la forma `{ error: {...} }`,
 * un mensaje útil en el idioma del usuario y el `requestId` para soporte.
 * Nunca se envía un stack trace ni un "Error 500" crudo.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const mapped = mapError(exception);
    const requestId = String(request.id);

    if (mapped.unexpected) {
      const detail = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `Error inesperado en ${request.method} ${request.routeOptions.url ?? request.url} [${requestId}]: ${detail}`,
      );
    } else if (exception instanceof AppError && exception.internalDetail) {
      this.logger.warn(`${exception.code} [${requestId}]: ${exception.internalDetail}`);
    }

    const body: ApiErrorBody = {
      error: {
        code: mapped.code,
        message: errorMessage(mapped.code, languageFrom(request.headers['accept-language'])),
        requestId,
        ...(mapped.issues ? { issues: mapped.issues } : {}),
      },
    };

    void reply.status(mapped.status).header('cache-control', 'no-store').send(body);
  }
}
