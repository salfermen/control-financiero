# Arquitectura

Monolito modular en TypeScript. Una API, una web y un worker comparten paquetes de dominio, contratos y acceso a datos. No hay microservicios: no se justifican todavía (§49 de `AGENTS.md`).

```text
  Navegador ──► Web (Next.js) ──proxy /api/v1──┐
  Móvil (F14) ─────────────── Bearer ──────────┤
                                               ▼
                                API (NestJS + Fastify)
                         guards · validación · errores · auditoría
                                               │
                          Servicios de caso de uso (por módulo)
                           │                    │
              Financial Engine (@cf/domain)   Repositorios (@cf/db, Drizzle)
              puro, sin IO                              │
                                                   PostgreSQL ◄── Worker (pg-boss)
```

## Paquetes

| Paquete      | Responsabilidad                                                                                                                  | Depende de                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `@cf/domain` | Dominio puro y Financial Engine: monedas, categorías, `Money`, tasas, fechas contables, reglas del libro, saldos, flujo de caja. | `decimal.js`                  |
| `@cf/shared` | Contratos entre API y clientes: esquemas Zod de entrada y salida, códigos y mensajes de error (es/en).                           | `domain`, `zod`               |
| `@cf/db`     | Única puerta a PostgreSQL: esquema, migraciones, cliente, siembra, mantenimiento, utilidades de prueba (`@cf/db/testing`).       | `domain`, `drizzle-orm`, `pg` |
| `@cf/api`    | API REST versionada (`/api/v1`).                                                                                                 | `db`, `domain`, `shared`      |
| `@cf/worker` | Trabajos programados en el esquema `pgboss` e integraciones de datos externos (TRM oficial).                                     | `db`, `domain`                |
| `@cf/web`    | Interfaz web. Nunca calcula dinero: muestra lo que devuelve la API (y, desde F4, lo formatea con `formatMoney`).                 | `shared`                      |
| `@cf/e2e`    | Pruebas de extremo a extremo.                                                                                                    | `db`                          |

Todos los paquetes son ESM (`"type": "module"`), compilados con `tsc`. NestJS 12 es ESM, y un único formato evita problemas de interoperabilidad.

## Financial Engine (`@cf/domain`)

Fuente única de los cálculos financieros (§9 y §58 de `AGENTS.md`). Es código puro: no lee la base, no llama APIs y no conoce la hora actual; recibe todo como parámetro, así que es determinista y se prueba de forma exhaustiva. ESLint impide importar `decimal.js` fuera de este paquete.

| Módulo                               | Qué resuelve                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `money/`                             | `Money`: decimal exacto con máximo 4 decimales y rango de NUMERIC(20,4); suma/resta exactas; multiplicar, dividir y convertir con redondeo explícito; reparto sin pérdidas (cuotas); `formatMoney` para la UI. |
| `fx/`                                | `ExchangeRate` con fuente, fecha e id; `convert` en ambos sentidos del par (el inverso por división exacta); `impliedRate` cuando el extracto trae el valor real.                                              |
| `dates/`                             | Fechas contables `YYYY-MM-DD` sin zona horaria: calendario real (bisiestos), suma de días y meses con ajuste a fin de mes, rangos inclusivos, fecha local de un instante en una zona IANA.                     |
| `ledger/entry`                       | `LedgerEntry` (mismos nombres que las columnas de `transactions`) y `assertValidLedgerEntry`, espejo de los `CHECK` de la base.                                                                                |
| `ledger/amounts`                     | `prepareLedgerAmounts`: los tres montos (original, cuenta, base) y sus tasas listos para insertar; nunca inventa una tasa.                                                                                     |
| `ledger/balance`                     | `computeAccountBalance(s)`: saldo inicial + movimientos, con asentados y pendientes por separado y conteo de lo excluido.                                                                                      |
| `ledger/cash-flow`                   | `computeCashFlow`: ingresos, gastos, comisiones, reembolsos, neto, tasa de ahorro y desglose por categoría en moneda base.                                                                                     |
| `ledger/transfers`, `ledger/refunds` | Validación de las dos patas de una transferencia o pago, y de reembolsos contra el gasto original.                                                                                                             |

Los errores son `DomainError` con un código estable (`CURRENCY_MISMATCH`, `MISSING_EXCHANGE_RATE`, `INVALID_LEDGER_ENTRY`…); desde F4 la API los traducirá a respuestas HTTP. Las reglas de negocio están en `docs/DECISIONS.md` (D8–D12).

## Capas dentro de la API

Cada dominio es un módulo Nest (`auth`, `users`, `reference`, `accounts`, `transactions`, `fx` y `cash-flow`; `finance` comparte el contexto del usuario —moneda base, zona y «hoy»— y los mapeos a DTO):

1. **Controlador**: valida la entrada con el esquema Zod compartido (`ZodPipe`) y documenta el contrato en OpenAPI con el mismo esquema.
2. **Servicio**: orquesta el caso de uso. Los cálculos los hace el Financial Engine (saldos, conversiones, reglas del libro, flujo de caja), nunca el servicio por su cuenta. Antes de escribir valida cada movimiento con el motor; la base lo vuelve a verificar con sus `CHECK`.
3. **Persistencia**: Drizzle con el esquema de `@cf/db`. Toda consulta filtra por el `user_id` del contexto autenticado.

## Capas transversales

| Capa                 | Implementación                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuración        | `loadConfig()` valida el entorno con Zod al arrancar; si falla, el proceso termina con un mensaje que nombra las variables (nunca sus valores). |
| Autenticación        | Guard global `SessionGuard`: toda ruta exige sesión salvo `@Public()`. Seguro por defecto.                                                      |
| CSRF                 | Hook `onRequest`: POST/PUT/PATCH/DELETE con cookie exigen `x-csrf-protection: 1`.                                                               |
| Errores              | `GlobalExceptionFilter` convierte todo en `{ error: { code, message, requestId, issues? } }`. Sin stack traces hacia el cliente.                |
| Validación           | Zod en el borde (API), en el cliente (web) y constraints en la base.                                                                            |
| Límite de peticiones | `@fastify/rate-limit`: general por IP y otro más estricto para login y registro.                                                                |
| Cabeceras            | `@fastify/helmet` (CSP, nosniff, frame-ancestors, HSTS en producción).                                                                          |
| Logs                 | pino en JSON con `requestId`; contraseñas, cookies y tokens redactados.                                                                         |
| Auditoría            | `AuditService` escribe en `audit_logs` (solo inserción, protegido por trigger).                                                                 |
| Trazabilidad         | Cada respuesta lleva `x-request-id` (UUID v7), el mismo que aparece en logs y errores.                                                          |

## Procedencia de los datos

Regla de producto (§2 del prompt maestro): cada valor debe poder distinguirse como `real`, `synced`, `estimated`, `projected` o `recommended`. Hoy se refleja en el modelo con `source`, `sync_status` y los campos de conversión de cada movimiento; los DTOs financieros que lleguen desde F4 incluirán la procedencia de forma explícita.

## Web

- App Router de Next.js 16, Tailwind 4 con tokens de color para modo claro y oscuro.
- `app/api/v1/[...path]/route.ts` reenvía las llamadas del navegador a la API (misma URL de origen: la cookie es de primera parte). La dirección de la API se lee en tiempo de ejecución (`API_INTERNAL_URL`).
- Pantallas con sesión en `app/(app)/`: Inicio (flujo del mes, TRM, cuentas), Cuentas (lista con saldo, crear, editar, cerrar, borrar) y Movimientos (mes, resumen, lista paginada, registrar gasto/ingreso/transferencia, corregir, reembolsar, eliminar).
- Los Server Components leen con `serverApi()` (`lib/server-api.ts`), que reenvía la cookie y valida la respuesta con el esquema compartido; `getSession()` usa `cache` para no repetir la consulta en la misma petición.
- Los formularios escriben con `apiRequest()` y luego refrescan la ruta. Los montos se escriben como en Colombia («25.000», «59,99»); `parseAmountInput` del motor los normaliza y la pantalla muestra «Se registrará: …» antes de guardar.
- Fechas contables mostradas con `formatDate` sobre las partes de la fecha en UTC: nunca se corren un día.
- Cada respuesta de la API se valida en el cliente con el esquema compartido: si no cumple el contrato, se muestra un error, no datos dudosos.

## Worker

`apps/worker` arranca pg-boss en su propio esquema, crea las colas y programa los trabajos de `buildJobs(config)` en hora de Bogotá:

- `maintenance.session-cleanup` (03:17 diario).
- `fx.trm-sync` (08:23, 13:23 y 18:23, y una vez al arrancar): descarga la TRM oficial de los últimos 10 días y la anticipada desde el proveedor configurado y la guarda en `exchange_rates` (solo inserción; si el proveedor publica un valor distinto para una fecha ya guardada, no se sobrescribe y se avisa en los logs). `pnpm fx:sync [--from AAAA-MM-DD] [--to AAAA-MM-DD]` hace lo mismo a demanda, también para cargar histórico.

Integraciones en `src/integrations/`: cada proveedor implementa `ExchangeRateProvider` (fuente estable, errores tipados `unavailable`/`rate_limited`/`invalid_response`, tiempo de espera y validación de la respuesta con Zod y con el motor). Las pruebas usan proveedores simulados explícitos; la app nunca usa datos simulados.

## Qué no existe todavía

Presupuestos, recurrencias, importación de extractos, conciliación de saldos (`account_balance_snapshots`) y el tablero v1 (F5); deudas, metas y patrimonio (F6), y todo lo posterior del plan. Tasas automáticas solo para USD/COP (TRM); otras monedas se registran con el valor cobrado o una tasa escrita por la persona. Ver la auditoría y `docs/DECISIONS.md`.
