import { createHash, createHmac, randomBytes } from 'node:crypto';

/** SHA-256 en hexadecimal. Se usa para guardar tokens de sesión sin poder revertirlos. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Seudonimiza una IP con HMAC: permite correlacionar eventos de una misma IP
 * sin almacenarla en claro (minimización de datos personales).
 */
export function hashIp(ip: string | undefined, secret: string): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret).update(ip, 'utf8').digest('hex');
}

/** Token de sesión opaco: 256 bits aleatorios en base64url (43 caracteres). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
