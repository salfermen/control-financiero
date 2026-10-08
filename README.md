# Control Financiero

Plataforma financiera personal inteligente: un centro de control para conocer, proyectar y mejorar la situación financiera de una persona. Moneda base inicial: **COP**.

> **Estado actual: fases F1 (fundaciones), F2 (datos e identidad) y F3 (Financial Engine) completas.**
> Hay infraestructura, modelo de datos, autenticación, auditoría, una web mínima de acceso y el motor
> de cálculos financieros. **Todavía no hay pantallas ni endpoints financieros** (cuentas, movimientos,
> presupuestos…): llegan desde F4. La aplicación no muestra saldos ni cifras de ejemplo.

Las reglas de trabajo del proyecto están en [`AGENTS.md`](AGENTS.md) (instrucciones maestras) y el plan por fases en la auditoría inicial.

## Qué incluye hoy

| Área                                                                             | Estado                             |
| -------------------------------------------------------------------------------- | ---------------------------------- |
| Monorepo pnpm + Turborepo, TypeScript estricto, ESLint, Prettier                 | Listo                              |
| PostgreSQL + Drizzle: esquema, migraciones versionadas, datos de referencia      | Listo                              |
| Libro único de movimientos con reglas de integridad en la base (sin API aún)     | Listo (API en F4)                  |
| Financial Engine: `Money` exacto, tasas, fechas contables, saldos, flujo de caja | Listo (sin API aún; F4)            |
| API NestJS + Fastify: errores estándar, validación Zod, OpenAPI, health checks   | Listo                              |
| Autenticación: registro, login (cookie o bearer), logout, bloqueo progresivo     | Listo                              |
| Seguridad: Argon2id, sesiones opacas con hash, CSRF, CORS, rate limit, cabeceras | Listo                              |
| Auditoría de solo inserción y logs estructurados sin secretos                    | Listo                              |
| Worker pg-boss con limpieza diaria de sesiones                                   | Listo                              |
| Web Next.js: ingresar, registro, inicio y cierre de sesión (claro/oscuro, móvil) | Listo (mínima)                     |
| Pruebas: unitarias, integración con PostgreSQL real y E2E con Playwright         | Listo                              |
| CI de GitHub Actions                                                             | Listo (`.github/workflows/ci.yml`) |

## Requisitos (Windows, macOS o Linux)

- **Node.js 24 LTS** (mínimo 22.12). El archivo `.nvmrc` indica la versión.
- **pnpm 10** — se activa con `corepack enable` (viene con Node).
- **Docker Desktop** para PostgreSQL local.
- **Git**.

## Puesta en marcha

En PowerShell o en la terminal de VS Code, desde la carpeta del proyecto:

```powershell
corepack enable
pnpm install

# 1. Configura el entorno
copy .env.example .env      # en macOS/Linux: cp .env.example .env
#    Edita .env: define POSTGRES_PASSWORD, ponla en las tres URLs de base de datos
#    y genera IP_HASH_SECRET con:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Levanta PostgreSQL y prepara la base (migraciones + datos de referencia)
pnpm db:up
pnpm db:setup

# 3. Arranca API (:4000), worker y web (:3000)
pnpm dev
```

Abre <http://localhost:3000>. La documentación interactiva de la API está en <http://127.0.0.1:4000/api/docs>.

## Scripts principales

| Comando                        | Qué hace                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| `pnpm dev`                     | API, worker y web en modo desarrollo con recarga                       |
| `pnpm build`                   | Compila todos los paquetes y apps                                      |
| `pnpm lint` / `pnpm typecheck` | ESLint con tipos / TypeScript sin emitir                               |
| `pnpm test`                    | Pruebas unitarias                                                      |
| `pnpm test:integration`        | Pruebas contra PostgreSQL real (usa `TEST_DATABASE_URL`, que se borra) |
| `pnpm test:e2e`                | Flujos completos en navegador (usa `E2E_DATABASE_URL`)                 |
| `pnpm check`                   | Formato + build + lint + tipos + unitarias + integración               |
| `pnpm db:up` / `pnpm db:down`  | Inicia / detiene PostgreSQL en Docker                                  |
| `pnpm db:setup`                | Aplica migraciones y siembra datos de referencia                       |
| `pnpm db:new-migration`        | Genera una migración a partir de cambios en el esquema                 |
| `pnpm db:studio`               | Explorador visual de la base (Drizzle Studio)                          |

La primera vez que corras `pnpm test:e2e`, instala el navegador: `pnpm --filter @cf/e2e exec playwright install chromium`.

### Integración continua

`.github/workflows/ci.yml` se ejecuta en cada push a `main` y en cada pull request, con dos trabajos: **calidad** (formato, build, lint, tipos, pruebas unitarias, integración y E2E) y **seguridad** (auditoría de dependencias y escaneo de secretos con gitleaks). Si gitleaks marca un dato ficticio de una prueba, consulta [CONTRIBUTING](CONTRIBUTING.md#convenciones).

### Editor recomendado

VS Code con las extensiones ESLint (`dbaeumer.vscode-eslint`), Prettier (`esbenp.prettier-vscode`) y Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`); activa «Format on Save».

## Estructura

```text
apps/
  api/        API REST (NestJS + Fastify)
  web/        Web (Next.js + Tailwind)
  worker/     Trabajos programados (pg-boss)
packages/
  domain/     Dominio sin IO: datos de referencia y Financial Engine (fuente única de cálculos)
  shared/     Contratos compartidos: esquemas Zod, DTOs, códigos de error
  db/         Esquema Drizzle, migraciones SQL, cliente, siembra
e2e/          Pruebas Playwright de flujos críticos
infrastructure/  docker-compose de PostgreSQL local
.github/      Flujo de CI (GitHub Actions)
docs/         Documentación técnica
```

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Base de datos](docs/DATABASE.md)
- [API](docs/API.md)
- [Variables de entorno](docs/ENVIRONMENT.md)
- [Seguridad](docs/SECURITY.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Decisiones técnicas](docs/DECISIONS.md)
- [Cómo contribuir](CONTRIBUTING.md)
