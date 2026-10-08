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
- **Listas**: `{ "data": [...] }`; las paginadas añaden `nextCursor`.
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

| Código                                                 | HTTP | Cuándo                                                                                                                                       |
| ------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                                     | 400  | Datos inválidos o JSON mal formado; `issues` detalla los campos.                                                                             |
| `UNAUTHENTICATED`                                      | 401  | Sin sesión, sesión vencida, inactiva, revocada o cabecera Authorization mal formada.                                                         |
| `INVALID_CREDENTIALS`                                  | 401  | Correo o contraseña incorrectos (mismo mensaje si el correo no existe).                                                                      |
| `CSRF_REJECTED`                                        | 403  | Falta `x-csrf-protection` en una petición con cookie.                                                                                        |
| `FORBIDDEN`                                            | 403  | Sin permiso.                                                                                                                                 |
| `NOT_FOUND`                                            | 404  | Ruta o recurso inexistente.                                                                                                                  |
| `CONFLICT` / `EMAIL_TAKEN` / `BASE_CURRENCY_LOCKED`    | 409  | Conflicto con datos existentes.                                                                                                              |
| `ACCOUNT_CLOSED` / `ACCOUNT_HAS_TRANSACTIONS`          | 409  | Cuenta cerrada (no admite movimientos) o con historial (no se borra: se cierra).                                                             |
| `TRANSACTION_HAS_REFUNDS` / `TRANSACTION_NOT_EDITABLE` | 409  | Gasto con reembolsos (borra primero los reembolsos) o cambio no permitido en ese movimiento.                                                 |
| `TRANSACTION_BEFORE_OPENING_BALANCE`                   | 422  | Fecha anterior al saldo inicial de la cuenta (ya está incluido en él).                                                                       |
| `EXCHANGE_RATE_UNAVAILABLE`                            | 422  | No hay tasa oficial vigente para esa fecha: envía el valor cobrado o la tasa. Nunca se inventa.                                              |
| `RULE_VIOLATION`                                       | 422  | La operación no cumple una regla financiera (reembolso mayor que el gasto, transferencia que llega antes de salir…); `issues` dice el campo. |
| `PAYLOAD_TOO_LARGE`                                    | 413  | Cuerpo de más de 1 MB.                                                                                                                       |
| `ACCOUNT_LOCKED`                                       | 423  | Bloqueo temporal tras intentos fallidos.                                                                                                     |
| `RATE_LIMITED`                                         | 429  | Demasiadas peticiones; ver `retry-after`.                                                                                                    |
| `SERVICE_UNAVAILABLE`                                  | 503  | Dependencia caída.                                                                                                                           |
| `INTERNAL_ERROR`                                       | 500  | Error inesperado; el detalle queda solo en los logs con el mismo `requestId`.                                                                |

## Endpoints

| Método | Ruta                                                | Acceso  | Descripción                                                                                                                                         |
| ------ | --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health/live`                                      | Público | El proceso responde.                                                                                                                                |
| GET    | `/health/ready`                                     | Público | PostgreSQL responde (503 si no).                                                                                                                    |
| POST   | `/api/v1/auth/register`                             | Público | Crea cuenta, registra consentimiento y abre sesión por cookie.                                                                                      |
| POST   | `/api/v1/auth/login`                                | Público | Inicia sesión por cookie o bearer.                                                                                                                  |
| GET    | `/api/v1/auth/session`                              | Sesión  | Usuario y vigencia de la sesión.                                                                                                                    |
| POST   | `/api/v1/auth/logout`                               | Sesión  | Cierra la sesión actual.                                                                                                                            |
| POST   | `/api/v1/auth/logout-all`                           | Sesión  | Cierra todas las sesiones del usuario.                                                                                                              |
| GET    | `/api/v1/me`                                        | Sesión  | Perfil y ajustes.                                                                                                                                   |
| PATCH  | `/api/v1/me/settings`                               | Sesión  | Moneda base, idioma, zona horaria, tema. La moneda base se bloquea si ya hay movimientos o presupuestos.                                            |
| GET    | `/api/v1/currencies`                                | Público | Monedas soportadas.                                                                                                                                 |
| GET    | `/api/v1/categories`                                | Sesión  | Categorías del sistema y del usuario, traducidas.                                                                                                   |
| POST   | `/api/v1/categories`                                | Sesión  | Crea una categoría propia (`name`, `kind`, `parentId` opcional de una principal del mismo tipo). Nombre repetido → `CATEGORY_NAME_TAKEN`.           |
| PATCH  | `/api/v1/categories/:id`                            | Sesión  | Renombra o reubica una categoría propia. Las del sistema → `FORBIDDEN`. El tipo no cambia.                                                          |
| DELETE | `/api/v1/categories/:id?moveTo=`                    | Sesión  | Borrado lógico. Con movimientos exige `moveTo` (se reasignan); con subcategorías o presupuesto vigente → `CATEGORY_IN_USE`.                         |
| GET    | `/api/v1/accounts`                                  | Sesión  | Cuentas con su saldo de hoy (asentado, pendiente, actual) y, aparte, lo programado (`scheduled`) y lo que quedará (`projected`).                    |
| POST   | `/api/v1/accounts`                                  | Sesión  | Crea una cuenta con su saldo inicial y su fecha.                                                                                                    |
| GET    | `/api/v1/accounts/:id`                              | Sesión  | Una cuenta con su saldo.                                                                                                                            |
| PATCH  | `/api/v1/accounts/:id`                              | Sesión  | Nombre, entidad, saldo inicial, notas o estado (`closed` la cierra). Moneda y tipo no cambian.                                                      |
| DELETE | `/api/v1/accounts/:id`                              | Sesión  | Borra una cuenta sin movimientos.                                                                                                                   |
| GET    | `/api/v1/transactions`                              | Sesión  | Movimientos del más reciente al más antiguo. Filtros `from`, `to`, `accountId`, `categoryId`, `type`, `status`, `q`; paginación `limit` + `cursor`. |
| POST   | `/api/v1/transactions`                              | Sesión  | `kind`: `expense`, `income`, `fee`, `transfer` (o pago a tarjeta/crédito) o `refund`. Devuelve `{ data: [...] }` (dos patas en transferencias).     |
| GET    | `/api/v1/transactions/:id`                          | Sesión  | Un movimiento con su conversión y procedencia.                                                                                                      |
| PATCH  | `/api/v1/transactions/:id`                          | Sesión  | Corrige descripción, categoría, fecha, monto (sin cambio de moneda), comercio, notas o estado.                                                      |
| DELETE | `/api/v1/transactions/:id`                          | Sesión  | Borrado lógico; una transferencia se borra con sus dos patas.                                                                                       |
| GET    | `/api/v1/cash-flow?month=AAAA-MM`                   | Sesión  | Ingresos, gastos, reembolsos, neto, tasa de ahorro y desglose por categoría en la moneda base; `scheduled` = parte con fecha posterior a hoy.       |
| GET    | `/api/v1/budgets?month=AAAA-MM`                     | Sesión  | Presupuestos vigentes en el mes: límite, gastado, programado, comprometido, restante, nivel (`ok`/`notice`/`warning`/`exceeded`) y ritmo estimado.  |
| POST   | `/api/v1/budgets`                                   | Sesión  | Crea un presupuesto mensual global (`categoryId: null`) o de una categoría de gasto, desde `startMonth`. Solapado → `BUDGET_EXISTS`.                |
| PATCH  | `/api/v1/budgets/:id`                               | Sesión  | Cambia el límite desde `fromMonth`; los meses anteriores conservan el suyo (se crea una versión nueva).                                             |
| DELETE | `/api/v1/budgets/:id?fromMonth=`                    | Sesión  | Deja de presupuestar desde ese mes (cierra la versión) o la elimina si empieza ese mes.                                                             |
| GET    | `/api/v1/summary`                                   | Sesión  | Tablero: disponible, inversiones, deudas y patrimonio (hoy y a fin de mes), flujo del mes, presupuestos y próximos movimientos.                     |
| GET    | `/api/v1/exchange-rates/current?base=USD&quote=COP` | Sesión  | Tasa vigente con fuente, fecha, estado (`current`/`stale`/`missing`) y variación frente a la anterior.                                              |
| GET    | `/api/v1/exchange-rates?base&quote&from&to`         | Sesión  | Histórico de tasas publicadas.                                                                                                                      |

### Hoy y lo programado

Un movimiento con fecha posterior a hoy (zona horaria del usuario) es **programado**: no cambia el saldo de hoy y se informa aparte.

- En cada cuenta, `balance.current` es el saldo de hoy; `balance.scheduled`, el efecto neto de lo programado, y `balance.projected = current + scheduled` lo que quedará («te queda»), con `projectedThrough` (fecha del último movimiento programado).
- Una cuenta cuyo saldo inicial tiene fecha futura (`startsOn`) no tiene saldo hoy (`current = 0`); su saldo inicial cuenta en `scheduled`.
- `/summary` proyecta hasta fin de mes (`endOfMonth`) y cuenta aparte lo programado después (`scheduledAfterMonthEnd`). Las cuentas en otra moneda se convierten con la tasa de hoy; sin tasa confiable van a `unconverted` y no se suman.

### Presupuestos

Límite mensual en la moneda base, global o por categoría de gasto (incluye sus subcategorías). Gastado = gastos + comisiones − reembolsos (montos base del día de cada movimiento) con fecha hasta hoy; programado = los del mes con fecha posterior. El nivel de alerta usa lo comprometido (gastado + programado): 75 %, 90 % y 100 %. `pace` es una estimación al ritmo actual (desde el día 7 del período), no un hecho.

### Movimientos en otra moneda

`amount` va en la moneda del comercio (`currency`, por defecto la de la cuenta). Si difiere de la de la cuenta:

1. `fx.accountAmount`: lo que realmente cobró el banco (manda; `fx.estimated = false`).
2. `fx.rate`: la tasa que aplicó el banco (fuente `manual`; estimado).
3. Sin `fx`: la TRM guardada vigente ese día (o una de hasta 5 días si no hay publicación, p. ej. festivos); si no existe, `EXCHANGE_RATE_UNAVAILABLE`.

Cada movimiento guarda el monto original, el de la cuenta y el de la moneda base con sus tasas, la fuente y el instante de conversión; el original nunca se modifica.

## Límites de peticiones

- General: `RATE_LIMIT_MAX` por minuto e IP (300 por defecto).
- `POST /auth/login` y `POST /auth/register`: `AUTH_RATE_LIMIT_MAX` por minuto e IP (10 por defecto), contador separado.
- Además, cada cuenta se bloquea 15 minutos tras 5 contraseñas incorrectas; el bloqueo se duplica cada 5 fallos más (máximo 24 h).
