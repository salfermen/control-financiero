# Base de datos

PostgreSQL (probado en 16; el entorno local y la CI usan 17) con Drizzle ORM. El esquema vive en `packages/db/src/schema/` y las migraciones SQL versionadas en `packages/db/migrations/`.

## Convenciones

| Tema             | Regla                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claves           | UUID v7 generado por la aplicación (`uuidv7()`); `gen_random_uuid()` como respaldo en SQL manual.                                                          |
| Dinero           | `NUMERIC(20,4)`; Drizzle lo devuelve como `string`, nunca como `number`.                                                                                   |
| Tasas de cambio  | `NUMERIC(24,10)`.                                                                                                                                          |
| Moneda           | `CHAR(3)` con FK a `currencies` (ISO 4217).                                                                                                                |
| Fechas contables | `DATE` (`transaction_date`, `posted_date`, `opening_balance_date`), como texto `YYYY-MM-DD`: sin corrimiento por zona horaria.                             |
| Instantes        | `timestamptz` (`created_at`, `updated_at`, `expires_at`…), siempre UTC.                                                                                    |
| Borrado          | `deleted_at` en entidades del usuario. Los históricos (`audit_logs`, `exchange_rates`) no se editan. Borrar un usuario elimina en cascada todos sus datos. |
| Aislamiento      | `user_id` en toda tabla del usuario; los índices empiezan por él.                                                                                          |
| Sincronización   | `source`, `external_id`, `last_synced_at`, `sync_status`; único por (`user_id`, `source`, `external_id`).                                                  |

## Tablas actuales

| Tabla            | Propósito                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `users`          | Cuenta: correo en minúsculas y único, hash Argon2id, estado, contador de intentos fallidos y bloqueo.        |
| `user_settings`  | Moneda base (COP por defecto), idioma (`es-CO`/`en-US`), zona horaria (`America/Bogota`), tema.              |
| `sessions`       | Sesiones opacas: solo el SHA-256 del token, transporte (cookie/bearer), vencimiento, último uso, revocación. |
| `consents`       | Consentimientos (términos y privacidad) con versión e IP seudonimizada.                                      |
| `audit_logs`     | Eventos de seguridad y cambios. Solo inserción (trigger bloquea UPDATE).                                     |
| `currencies`     | 14 monedas ISO 4217 con decimales oficiales y de visualización.                                              |
| `categories`     | Categorías del sistema (23, con `system_key`) y del usuario; jerarquía de un nivel.                          |
| `exchange_rates` | Histórico de tasas por fuente y fecha. Solo inserción. Aún sin proveedor (F4).                               |
| `accounts`       | Cuentas de activo y pasivo. El saldo no se guarda: se calcula desde el libro.                                |
| `transactions`   | Libro único de movimientos (ingresos y gastos son tipos, no tablas).                                         |

Esquema de pg-boss: `pgboss` (lo gestiona el worker, separado del negocio).

## Reglas de integridad en la base

Estas reglas no dependen del código; la base rechaza los datos que las violan y las pruebas de `packages/db/src/schema.int.test.ts` lo verifican:

- Montos de movimientos estrictamente positivos; la dirección la dan `type` y `direction`, que deben ser coherentes (ingreso/reembolso = entrada; gasto/comisión = salida).
- Una transferencia exige `transfer_group_id` y no lleva categoría. Ingresos, gastos, reembolsos y comisiones no pueden tener grupo de transferencia.
- `refund_of_id` solo en reembolsos.
- Multimoneda: si la moneda original difiere de la de la cuenta o de la base, la tasa es obligatoria y positiva, y la conversión debe registrar `fx_source` y `fx_converted_at`. Si coinciden, no hay tasa y los montos son iguales. El monto original nunca se sobrescribe.
- FK compuesta `(account_id, user_id, account_currency)` → `accounts(id, user_id, currency)`: un movimiento no puede apuntar a la cuenta de otro usuario ni usar otra moneda que la de su cuenta. Además impide cambiar la moneda de una cuenta con movimientos.
- No se puede borrar físicamente una cuenta con historial.
- `posted_date >= transaction_date`; las fechas inexistentes (29 de febrero en año no bisiesto) se rechazan.
- Tasas positivas, entre monedas distintas, únicas por fuente/par/fecha e inmutables.
- Correo en minúsculas; categorías del sistema xor del usuario; nombre de categoría único por usuario entre las no borradas.

## Flujo de migraciones

1. Cambia el esquema en `packages/db/src/schema/`.
2. `pnpm db:new-migration -- --name descripcion_corta` genera el SQL en `packages/db/migrations/`.
3. Revisa el SQL generado y versiona el archivo y `meta/`.
4. `pnpm db:migrate` lo aplica (también lo hace `db:setup`).

Para SQL que Drizzle no genera (triggers, funciones): `pnpm --filter @cf/db exec drizzle-kit generate --custom --name nombre` y escribe el SQL a mano (ver `0001_audit_logs_append_only.sql`).

La CI regenera las migraciones y falla si el esquema cambió sin migración. En producción las migraciones se aplican con `node packages/db/dist/cli.js migrate` (no necesita drizzle-kit). Nunca se modifica producción a mano.

## Datos de referencia

`pnpm db:seed` (o `db:setup`) inserta o actualiza monedas y categorías del sistema desde `@cf/domain`. Es idempotente y nunca borra filas. No crea datos de usuario de ejemplo.

## Tablas planificadas (no creadas)

Se crean con la migración de su fase, no antes:

| Fase | Tablas                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| F4   | `account_balance_snapshots`, `category_rules`                                                                                   |
| F5   | `recurring_rules`, `budgets`, `budget_lines`, `imports`, `import_rows`                                                          |
| F6   | `debts`, `debt_payments`, `credit_card_details`, `credit_card_statements`, `goals`, `goal_contributions`, `net_worth_snapshots` |
| F7   | `forecasts`, `forecast_points`, `simulations`, `recommendations`                                                                |
| F8   | `instruments`, `market_prices`, `investment_transactions`                                                                       |
| F9   | `products`, `stores`, `product_listings`, `price_observations`, `wishlist_items`                                                |
| F10  | `automation_rules`, `rule_runs`, `notifications`, `notification_preferences`                                                    |
| F11  | `bank_connections`, `bank_accounts`, `bank_transactions`, `sync_runs`                                                           |
| F12  | `ai_conversations`, `ai_messages`, `ai_tool_calls`, `ai_memories`                                                               |
| F13  | `exports`, `report_runs`                                                                                                        |
| F15  | `mfa_factors`                                                                                                                   |

## Respaldos

Pendiente para producción (F15): PostgreSQL administrado con recuperación a un punto en el tiempo y prueba periódica de restauración. En local, el volumen `postgres-data` de Docker no es un respaldo.
