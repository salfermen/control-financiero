import { randomBytes } from 'node:crypto';

/**
 * Genera un UUID versión 7 (RFC 9562): 48 bits de tiempo Unix en milisegundos
 * seguidos de bits aleatorios. Son ordenables por tiempo, lo que mantiene los
 * índices B-tree compactos frente a los UUID v4 completamente aleatorios.
 *
 * Se implementa aquí (unas pocas líneas) para no añadir una dependencia.
 */
export function uuidv7(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffff_ffff_ffff) {
    throw new RangeError('Marca de tiempo fuera del rango de UUID v7');
  }
  const bytes = randomBytes(16);
  // 48 bits de tiempo, big-endian.
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  // Versión 7 en los 4 bits altos del byte 6.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // Variante RFC 9562 (10xx) en los 2 bits altos del byte 8.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Extrae los milisegundos Unix codificados en un UUID v7. */
export function uuidv7Timestamp(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
