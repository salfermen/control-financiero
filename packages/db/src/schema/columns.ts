import { sql } from 'drizzle-orm';
import { char, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../uuid.js';

/**
 * Columnas reutilizables. Centralizan las convenciones del modelo de datos
 * (docs/DATABASE.md) para que ninguna tabla las implemente distinto.
 */

/** Clave primaria UUID v7 generada por la aplicación; v4 como respaldo en SQL manual. */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .$defaultFn(() => uuidv7());

/** Instante con zona horaria (siempre UTC en la base). */
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => instant('created_at').notNull().defaultNow();

export const updatedAt = () =>
  instant('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const deletedAt = () => instant('deleted_at');

/**
 * Monto monetario exacto: NUMERIC(20,4). Drizzle lo devuelve como `string`
 * a propósito, para que nunca pase por `number` (coma flotante).
 */
export const money = (name: string) => numeric(name, { precision: 20, scale: 4 });

/** Tasa de cambio exacta: NUMERIC(24,10). */
export const fxRate = (name: string) => numeric(name, { precision: 24, scale: 10 });

/** Código de moneda ISO 4217. */
export const currencyCode = (name: string) => char(name, { length: 3 });

/** Hash SHA-256 en hexadecimal (tokens, IPs seudonimizadas). */
export const sha256Hex = (name: string) => char(name, { length: 64 });
