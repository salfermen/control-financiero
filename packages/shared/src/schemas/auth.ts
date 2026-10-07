import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  currencyCodeSchema,
  displayNameSchema,
  emailSchema,
  localeSchema,
  passwordSchema,
  themeSchema,
  timezoneSchema,
} from './common.js';

/** Versión vigente de términos y política de privacidad aceptada al registrarse. */
export const CURRENT_TERMS_VERSION = '2026-10-07';

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  locale: localeSchema.default('es-CO'),
  acceptTerms: z.literal(true, {
    error: 'Debes aceptar los términos y la política de privacidad.',
  }),
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

export const TOKEN_TRANSPORTS = ['cookie', 'bearer'] as const;

export const loginRequestSchema = z.object({
  email: emailSchema,
  // En el login no se valida la política: solo se limita el tamaño.
  password: z.string().min(1, 'Escribe tu contraseña.').max(PASSWORD_MAX_LENGTH),
  /**
   * `cookie` (web): la sesión viaja en una cookie httpOnly.
   * `bearer` (móvil): el token se devuelve una sola vez en el cuerpo.
   */
  tokenTransport: z.enum(TOKEN_TRANSPORTS).default('cookie'),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const updateSettingsRequestSchema = z
  .object({
    baseCurrency: currencyCodeSchema.optional(),
    locale: localeSchema.optional(),
    timezone: timezoneSchema.optional(),
    theme: themeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un ajuste.');
export type UpdateSettingsRequest = z.input<typeof updateSettingsRequestSchema>;

// --- Respuestas (también sirven como pruebas de contrato) ---

export const userSettingsDtoSchema = z.object({
  baseCurrency: z.string().length(3),
  locale: localeSchema,
  timezone: z.string(),
  theme: themeSchema,
});
export type UserSettingsDto = z.infer<typeof userSettingsDtoSchema>;

export const userDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  settings: userSettingsDtoSchema,
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const sessionDtoSchema = z.object({
  expiresAt: z.iso.datetime({ offset: true }),
  transport: z.enum(TOKEN_TRANSPORTS),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const authResponseDtoSchema = z.object({
  user: userDtoSchema,
  session: sessionDtoSchema,
  /** Solo presente con `tokenTransport: bearer`. Se entrega una única vez. */
  token: z.string().optional(),
});
export type AuthResponseDto = z.infer<typeof authResponseDtoSchema>;

/** Respuesta de `GET /auth/session` y del registro (sin token). */
export const sessionInfoDtoSchema = authResponseDtoSchema.omit({ token: true });
export type SessionInfoDto = z.infer<typeof sessionInfoDtoSchema>;
