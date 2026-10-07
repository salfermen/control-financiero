import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { IS_PUBLIC } from './decorators.js';
import { SessionService } from './session.service.js';

/** Extrae el token: primero `Authorization: Bearer` (móvil), luego la cookie (web). */
export function extractSessionToken(request: FastifyRequest, cookieName: string): string | null {
  const authorization = request.headers.authorization;
  if (authorization !== undefined) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    // Una cabecera presente pero mal formada es un error del cliente, no "anónimo".
    if (!match?.[1]) throw new AppError('UNAUTHENTICATED');
    return match[1];
  }
  return request.cookies[cookieName] ?? null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractSessionToken(request, this.config.SESSION_COOKIE_NAME);
    if (!token) throw new AppError('UNAUTHENTICATED');

    const auth = await this.sessions.validate(token);
    if (!auth) throw new AppError('UNAUTHENTICATED');

    request.auth = auth;
    return true;
  }
}
