# Despliegue

**Estado: solo desarrollo local.** La preparación para producción es la fase F15. Este documento describe lo que existe y el plan; no documenta funcionalidades que aún no están.

## Local (disponible)

1. `pnpm db:up` — PostgreSQL 17 en Docker, escuchando solo en `127.0.0.1:5432`. La primera vez crea también `finanzas_test` y `finanzas_e2e_test`.
2. `pnpm db:setup` — migraciones y datos de referencia.
3. `pnpm dev` — API (:4000), worker y web (:3000).

Para probar el modo producción en local: `pnpm build`, luego `pnpm --filter @cf/api start`, `pnpm --filter @cf/worker start` y `pnpm --filter @cf/web start`.

> El `docker-compose.yml` no pudo ejecutarse en el entorno donde se construyó el proyecto (sin Docker). La configuración es estándar; si algo falla al primer `pnpm db:up`, revisa que Docker Desktop esté iniciado y que `POSTGRES_PASSWORD` esté definida en `.env`.

## Integración continua (configurada)

`infrastructure/ci/github-actions-ci.yml` (moverlo a `.github/workflows/ci.yml` al crear el repositorio; ver README) se ejecuta en cada PR y en `main`: formato, build, lint, tipos, pruebas unitarias, control de desviación de migraciones, integración con PostgreSQL real, E2E con Playwright, auditoría de dependencias y escaneo de secretos. Se activa al subir el repositorio a GitHub.

## Producción (plan para F15)

| Pieza          | Propuesta                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web            | Next.js en Vercel o como contenedor.                                                                                                              |
| API y worker   | Imágenes Docker (Node 24 LTS), mismo build del monorepo.                                                                                          |
| Base de datos  | PostgreSQL administrado con respaldos y recuperación a un punto en el tiempo.                                                                     |
| Migraciones    | `node packages/db/dist/cli.js migrate` como paso previo al despliegue (una sola vez por versión).                                                 |
| Reverse proxy  | Delante de web y API, con TLS. Debe sobrescribir `X-Forwarded-For` y enrutar `/api/v1` directo a la API. La API con `TRUST_PROXY` = IP del proxy. |
| Secretos       | Gestor de secretos del proveedor; nunca en el repositorio ni en imágenes.                                                                         |
| Observabilidad | Logs JSON a un agregador, alertas sobre `/health/ready`, rastreo de errores.                                                                      |

Lista de verificación antes de producción: §52 de `AGENTS.md` (HTTPS, autenticación, autorización, secretos, respaldos, migraciones, rate limiting, CORS, cabeceras, logs, monitoreo, validación, pruebas, build, documentación).
