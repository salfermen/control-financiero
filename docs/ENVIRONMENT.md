# Variables de entorno

Todas se definen en `.env` en la raíz (plantilla: `.env.example`). API, worker y scripts de base de datos lo cargan con el cargador nativo de Node; **las variables ya presentes en el entorno tienen prioridad**, así que en CI y producción no se usa `.env`. La API y el worker validan su configuración al arrancar y terminan con un mensaje claro si algo falta (sin mostrar valores).

`.env` nunca se versiona. No pongas valores reales en `.env.example`.

## Base de datos

| Variable            | Usada por              | Descripción                                                                                                  |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD` | docker compose         | Contraseña del contenedor local.                                                                             |
| `DATABASE_URL`      | API, worker, `db`      | Conexión principal.                                                                                          |
| `TEST_DATABASE_URL` | Pruebas de integración | Se **borra** en cada ejecución. El nombre de la base debe contener `test`, o las pruebas se niegan a correr. |
| `E2E_DATABASE_URL`  | Pruebas E2E            | Igual que la anterior, base separada.                                                                        |

## API (`apps/api`)

| Variable                | Por defecto             | Descripción                                                                                                              |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`              | `development`           | `development`, `test` o `production`.                                                                                    |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `4000`    | Dirección de escucha.                                                                                                    |
| `DATABASE_POOL_MAX`     | `10`                    | Conexiones máximas del pool.                                                                                             |
| `CORS_ORIGINS`          | `http://localhost:3000` | Orígenes del navegador permitidos, separados por coma.                                                                   |
| `TRUST_PROXY`           | `false`                 | `false`, `true` (no recomendado) o lista de IPs/CIDR de proxies de confianza. Con la web local delante: `127.0.0.1,::1`. |
| `IP_HASH_SECRET`        | — (obligatoria)         | Secreto (≥ 32 caracteres) para seudonimizar IPs con HMAC.                                                                |
| `LOG_LEVEL`             | `info`                  | `fatal` … `trace`, o `silent`.                                                                                           |
| `SESSION_COOKIE_NAME`   | `cf_session`            | En producción se recomienda `__Host-cf_session`.                                                                         |
| `SESSION_COOKIE_SECURE` | `true` en producción    | Obligatoria en producción.                                                                                               |
| `SESSION_TTL_DAYS`      | `30`                    | Vida máxima de una sesión.                                                                                               |
| `SESSION_IDLE_DAYS`     | `7`                     | Inactividad máxima (no puede superar el TTL).                                                                            |
| `RATE_LIMIT_MAX`        | `300`                   | Peticiones por minuto e IP.                                                                                              |
| `AUTH_RATE_LIMIT_MAX`   | `10`                    | Intentos de login/registro por minuto e IP.                                                                              |
| `API_DOCS_ENABLED`      | `true` salvo producción | Publica `/api/docs`.                                                                                                     |
| `APP_VERSION`           | `0.1.0`                 | Se informa en `/health/ready`.                                                                                           |

## Worker (`apps/worker`)

| Variable              | Por defecto      | Descripción                         |
| --------------------- | ---------------- | ----------------------------------- |
| `DATABASE_URL`        | —                | Misma base que la API.              |
| `WORKER_TIMEZONE`     | `America/Bogota` | Zona en la que se evalúan los cron. |
| `WORKER_QUEUE_SCHEMA` | `pgboss`         | Esquema de las colas.               |
| `LOG_LEVEL`           | `info`           | Nivel de logs.                      |

## Web (`apps/web`)

| Variable           | Por defecto             | Descripción                                                                         |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `API_INTERNAL_URL` | `http://127.0.0.1:4000` | Dirección de la API vista desde el servidor de Next. Se lee en tiempo de ejecución. |

Next.js no lee el `.env` de la raíz: si necesitas cambiar `API_INTERNAL_URL` en desarrollo, crea `apps/web/.env.local`.

## Pruebas E2E

| Variable           | Descripción                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `PW_CHROMIUM_PATH` | Opcional. Ruta a un Chromium ya instalado si no se usa `playwright install`. |

## Futuras (se documentarán en su fase)

`FX_*` (F4, tasas de cambio), `MARKET_*` (F8), `ITAD_API_KEY` y `MELI_*` (F9), `SMTP_URL` y `VAPID_*` (F10), `BANK_*` (F11), `AI_*` (F12), clave de cifrado de tokens (F11).
