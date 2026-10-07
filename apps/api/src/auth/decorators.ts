import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../common/errors/app-error.js';
import type { AuthContext } from './session.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export const IS_PUBLIC = 'cf:isPublic';

/**
 * Marca una ruta como pública. Por defecto TODAS las rutas exigen sesión
 * (seguro por defecto): olvidar este decorador nunca expone datos.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Inyecta el contexto de autenticación de la petición. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!request.auth) throw new AppError('UNAUTHENTICATED');
    return request.auth;
  },
);
