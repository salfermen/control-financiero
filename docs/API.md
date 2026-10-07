# API

REST versionada bajo `/api/v1`. La especificación OpenAPI se genera desde los mismos esquemas Zod que validan las peticiones:

- Interactiva: `http://127.0.0.1:4000/api/docs` (activa por defecto fuera de producción, `API_DOCS_ENABLED`).
- JSON: `/api/docs/openapi.json`, o `pnpm --filter @cf/api openapi:export` para escribir `apps/api/openapi.json`.

## Reglas generales

- **Sesión obligatoria** en todas las rutas salvo las marcadas como públicas.
- **Web**: la sesión viaja en una cookie `httpOnly`, `SameSite=Lax` (`Secure` en producción).
- **Móvil**: `POST /auth/login` con `"tokenTransport": "bearer"` devuelve el token una única vez; se envía como `Authorization: Bearer <token>`.
- **CSRF**: las peticiones POST/PUT/PATCH/DELETE autenticadas por cookie deben incluir `x-csrf-protection: 1`. Bearer no lo necesita.
- **Idioma de los mensajes**: según `Accept-Language` (`es` por defecto, `en`).
- **Montos**: siempre texto decimal (`"242959.5000"`), nunca números de coma flotante.
- **Listas**: `{ "data": [...] }`, para añadir paginación sin romper clientes.
- Cada respuesta incluye `x-request-id`.

## Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Algunos datos no son válidos. Revisa los campos marcados.",
    "requestId": "01a11827-52ed-7286-89c1-532c1d0d8904",
    "issues": [
      { "path": "password", "message": "La contraseña debe tener al menos 12 caracteres." }
    ]
  }
}
```

| Código                                              | HTTP | Cuándo                                                                               |
| --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`                                  | 400  | Datos inválidos o JSON mal formado; `issues` detalla los campos.                     |
| `UNAUTHENTICATED`                                   | 401  | Sin sesión, sesión vencida, inactiva, revocada o cabecera Authorization mal formada. |
| `INVALID_CREDENTIALS`                               | 401  | Correo o contraseña incorrectos (mismo mensaje si el correo no existe).              |
| `CSRF_REJECTED`                                     | 403  | Falta `x-csrf-protection` en una petición con cookie.                                |
| `FORBIDDEN`                                         | 403  | Sin permiso.                                                                         |
| `NOT_FOUND`                                         | 404  | Ruta o recurso inexistente.                                                          |
| `CONFLICT` / `EMAIL_TAKEN` / `BASE_CURRENCY_LOCKED` | 409  | Conflicto con datos existentes.                                                      |
| `PAYLOAD_TOO_LARGE`                                 | 413  | Cuerpo de más de 1 MB.                                                               |
| `ACCOUNT_LOCKED`                                    | 423  | Bloqueo temporal tras intentos fallidos.                                             |
| `RATE_LIMITED`                                      | 429  | Demasiadas peticiones; ver `retry-after`.                                            |
| `SERVICE_UNAVAILABLE`                               | 503  | Dependencia caída.                                                                   |
| `INTERNAL_ERROR`                                    | 500  | Error inesperado; el detalle queda solo en los logs con el mismo `requestId`.        |

## Endpoints

| Método | Ruta                      | Acceso  | Descripción                                                                               |
| ------ | ------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| GET    | `/health/live`            | Público | El proceso responde.                                                                      |
| GET    | `/health/ready`           | Público | PostgreSQL responde (503 si no).                                                          |
| POST   | `/api/v1/auth/register`   | Público | Crea cuenta, registra consentimiento y abre sesión por cookie.                            |
| POST   | `/api/v1/auth/login`      | Público | Inicia sesión por cookie o bearer.                                                        |
| GET    | `/api/v1/auth/session`    | Sesión  | Usuario y vigencia de la sesión.                                                          |
| POST   | `/api/v1/auth/logout`     | Sesión  | Cierra la sesión actual.                                                                  |
| POST   | `/api/v1/auth/logout-all` | Sesión  | Cierra todas las sesiones del usuario.                                                    |
| GET    | `/api/v1/me`              | Sesión  | Perfil y ajustes.                                                                         |
| PATCH  | `/api/v1/me/settings`     | Sesión  | Moneda base, idioma, zona horaria, tema. La moneda base se bloquea si ya hay movimientos. |
| GET    | `/api/v1/currencies`      | Público | Monedas soportadas.                                                                       |
| GET    | `/api/v1/categories`      | Sesión  | Categorías del sistema y del usuario, traducidas.                                         |

## Límites de peticiones

- General: `RATE_LIMIT_MAX` por minuto e IP (300 por defecto).
- `POST /auth/login` y `POST /auth/register`: `AUTH_RATE_LIMIT_MAX` por minuto e IP (10 por defecto), contador separado.
- Además, cada cuenta se bloquea 15 minutos tras 5 contraseñas incorrectas; el bloqueo se duplica cada 5 fallos más (máximo 24 h).
