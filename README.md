# Control Financiero

Plataforma financiera personal inteligente: un centro de control para conocer, proyectar y mejorar la situación financiera de una persona. Moneda base inicial: **COP**.

> **Estado actual: F1 a F4 completas y F5a lista.** Cuentas, gastos, ingresos, transferencias, pagos
> de tarjeta y reembolsos; saldo de hoy y «te queda» después de lo programado; presupuestos
> mensuales con alertas; categorías propias, y un tablero con disponible, deudas y patrimonio. La TRM
> oficial se descarga sola. Recurrencias y calendario (F5b) e importación de extractos (F5c) siguen.
> La aplicación nunca muestra cifras de ejemplo: todo lo que ves son tus datos.

Las reglas de trabajo del proyecto están en [`AGENTS.md`](AGENTS.md) (instrucciones maestras) y el plan por fases en la auditoría inicial.

## Qué incluye hoy

| Área                                                                             | Estado                               |
| -------------------------------------------------------------------------------- | ------------------------------------ |
| Monorepo pnpm + Turborepo, TypeScript estricto, ESLint, Prettier                 | Listo                                |
| PostgreSQL + Drizzle: esquema, migraciones versionadas, datos de referencia      | Listo                                |
| Libro único de movimientos con reglas de integridad en la base                   | Listo                                |
| Financial Engine: `Money` exacto, tasas, fechas contables, saldos, flujo de caja | Listo                                |
| Cuentas y movimientos (API y web): gastos, ingresos, transferencias, reembolsos  | Listo                                |
| Saldo de hoy y después de lo programado (movimientos con fecha futura)           | Listo                                |
| Presupuestos mensuales (global o por categoría) con alertas 75/90/100 %          | Listo                                |
| Categorías propias y tablero de inicio (disponible, deudas, patrimonio)          | Listo                                |
| TRM oficial (Superintendencia Financiera) descargada por el worker               | Listo (verificar con `pnpm fx:sync`) |
| API NestJS + Fastify: errores estándar, validación Zod, OpenAPI, health checks   | Listo                                |
| Autenticación: registro, login (cookie o bearer), logout, bloqueo progresivo     | Listo                                |
| Seguridad: Argon2id, sesiones opacas con hash, CSRF, CORS, rate limit, cabeceras | Listo                                |
| Auditoría de solo inserción y logs estructurados sin secretos                    | Listo                                |
| Worker pg-boss con limpieza diaria de sesiones                                   | Listo                                |
| Web Next.js: acceso, inicio, cuentas y movimientos (claro/oscuro, móvil)         | Listo                                |
| Pruebas: unitarias, integración con PostgreSQL real y E2E con Playwright         | Listo                                |
| CI de GitHub Actions                                                             | Listo (`.github/workflows/ci.yml`)   |

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

### Primeros pasos en la app

1. **Cuentas → Nueva cuenta**: crea tu cuenta de ahorros, efectivo, billetera o tarjeta con el saldo que tiene hoy (en tarjetas y préstamos, lo que debes).
2. **Movimientos → Registrar movimiento**: escribe el monto como lo harías normalmente («25.000», «59,99»); debajo verás cómo se va a registrar antes de guardar.
3. Compras en dólares: elige la moneda USD y usa la TRM del día, o escribe lo que te cobraron en pesos (lo más exacto).
4. Transferir a tu tarjeta de crédito se registra como **pago**: baja la deuda y no cuenta como gasto (el gasto se contó al comprar).
5. ¿Gastos que aún no ocurren (el arriendo del 30, lo que harás con el sueldo)? Regístralos con su fecha futura: no tocan el saldo de hoy y verás cuánto **te queda** después de ellos.
6. El sueldo conviene registrarlo como **ingreso** con su fecha (aunque sea futura) en una cuenta que ya existe: así aparece en los ingresos del mes y en tu tasa de ahorro. Si lo pusiste como saldo inicial de una cuenta nueva, la app lo trata como una cuenta que «empieza» ese día.
7. **Presupuestos**: ponle un límite al mes (global o por categoría); te avisa al 75 %, 90 % y 100 %.

### TRM oficial

El worker (`pnpm dev` lo arranca) descarga la TRM al iniciar y tres veces al día. Para traerla a demanda o cargar histórico:

```powershell
pnpm fx:sync                          # últimos 10 días
pnpm fx:sync --from 2025-01-01        # histórico desde una fecha
```

Si no hay conexión con datos.gov.co, el comando lo dice y no guarda nada; la app muestra «Datos temporalmente no disponibles» y te pide el valor cobrado.

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
| `pnpm fx:sync`                 | Descarga la TRM oficial a demanda (`--from`/`--to` para histórico)     |

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
  worker/     Trabajos programados (pg-boss) e integraciones (TRM)
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
