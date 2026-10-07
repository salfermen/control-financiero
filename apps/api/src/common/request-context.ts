import type { FastifyRequest } from 'fastify';
import { hashIp } from './security/crypto.js';

/** Datos de la petición que se guardan en auditoría y sesiones (sin IP en claro). */
export interface RequestContext {
  requestId: string;
  ipHash: string | null;
  userAgent: string | null;
}

export function requestContext(request: FastifyRequest, ipHashSecret: string): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: String(request.id),
    ipHash: hashIp(request.ip, ipHashSecret),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
  };
}
