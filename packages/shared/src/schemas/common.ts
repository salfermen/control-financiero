import { z } from 'zod';
import { CURRENCY_CODES } from '@cf/domain';

export const SUPPORTED_LOCALES = ['es-CO', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const uuidSchema = z.uuid();

/** Correo normalizado: sin espacios y en minúsculas (la BD exige minúsculas). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Escribe un correo válido.'));

/**
 * Política de contraseñas alineada con NIST SP 800-63B: longitud mínima alta y
 * sin reglas de composición forzadas. El máximo evita abusar del hash (DoS).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`);

export const currencyCodeSchema = z
  .string()
  .refine((value) => CURRENCY_CODES.includes(value), 'Moneda no soportada.');

export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const themeSchema = z.enum(THEMES);

/** Zona horaria IANA válida para el runtime actual (p. ej. America/Bogota). */
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Zona horaria no válida.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe tu nombre.')
  .max(80, 'El nombre no puede superar 80 caracteres.');
