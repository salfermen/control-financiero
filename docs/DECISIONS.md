# Decisiones técnicas

Registro de decisiones importantes (formato breve: contexto, decisión, consecuencias). La auditoría inicial aprobada el 7 de octubre de 2026 es la base; aquí se anotan los cambios respecto a ella.

## D1 — Drizzle en lugar de Prisma (7 oct 2026)

- **Contexto.** La auditoría proponía Prisma 7. Su CLI necesita descargar el motor de migraciones desde `binaries.prisma.sh`, dominio bloqueado en el entorno donde se construyó el proyecto, lo que impedía generar y verificar migraciones. Además, Prisma no modela `CHECK` ni índices parciales: habría que mantenerlos a mano fuera del esquema.
- **Decisión.** Usar Drizzle ORM (la alternativa aprobada en ambos documentos de requisitos).
- **Ventajas.** Paquetes 100 % npm sin binarios externos; `CHECK`, índices parciales y FK compuestas declarados en el esquema y en las migraciones; `NUMERIC` devuelto como `string` (nunca `number`), que encaja con la regla de no usar coma flotante.
- **Riesgos.** Ecosistema algo menor que Prisma. Mitigación: SQL generado legible y versionado, y CI que detecta desviaciones.
- **Impacto.** Ninguno sobre código existente (no había código).

## D2 — Todo el monorepo en ESM (7 oct 2026)

NestJS 12 se publica como ESM. Para evitar mezclar CommonJS y ESM, todos los paquetes usan `"type": "module"` con `module: NodeNext` (las importaciones relativas llevan `.js`).

## D3 — Autenticación propia en lugar de una librería (7 oct 2026)

- **Contexto.** El spike de F1 debía elegir entre Better Auth y una implementación propia.
- **Decisión.** Implementación propia y pequeña: Argon2id (`@node-rs/argon2`, binarios precompilados para Windows), sesiones opacas con hash en PostgreSQL y guard global de Nest.
- **Motivo.** Control total del modelo de datos y de la auditoría, sin acoplar el esquema a una librería; superficie de código reducida y cubierta por pruebas. MFA y OAuth se añaden en F15 sobre la misma tabla de sesiones.

## D4 — Proxy de la web como Route Handler (7 oct 2026)

Las `rewrites` de Next.js fijan el destino en el momento del build. Se reemplazaron por `app/api/v1/[...path]/route.ts`, que lee `API_INTERNAL_URL` en tiempo de ejecución: un mismo build sirve para cualquier entorno.

## D5 — Testcontainers sustituido por PostgreSQL de Docker Compose / servicio de CI (7 oct 2026)

Las pruebas de integración usan una base dedicada (`TEST_DATABASE_URL`) que se borra y migra en cada ejecución, en lugar de levantar contenedores desde las pruebas. Funciona igual en Windows (Docker Desktop), en CI (servicio `postgres`) y sin Docker-in-Docker. Las utilidades se niegan a operar sobre bases cuyo nombre no contenga `test`.

## D6 — Tablas creadas por fase, con el libro núcleo desde F2 (7 oct 2026)

Solo se crearon las tablas de identidad, referencia, auditoría, tasas y el libro (`accounts`, `transactions`). El libro se adelantó porque sus restricciones de integridad son la base de todo lo demás y debían probarse desde el principio. Sus endpoints llegan en F4.

## D7 — Cambio de moneda base bloqueado con movimientos (7 oct 2026)

Cambiar la moneda base con movimientos existentes dejaría sus montos base inconsistentes. La API lo bloquea (`BASE_CURRENCY_LOCKED`) hasta que exista una migración explícita y auditada de recálculo.

## D8 — Aritmética con decimal.js y pruebas con fast-check (7 oct 2026)

- **Contexto.** §10 prohíbe la coma flotante para dinero. La auditoría propuso un tipo `Money` propio sobre decimal.js.
- **Decisión.** `decimal.js` 10.6.0 (sin dependencias, mantenido desde 2014) dentro de `@cf/domain` como única dependencia de producción del motor. Se usa una copia aislada (`Decimal.clone`, 100 dígitos significativos) para que nada cambie su configuración global. Se eligió sobre enteros `BigInt` puros porque desde F6 harán falta potencias y raíces fraccionarias (tasa efectiva anual → mensual, cuotas), que decimal.js resuelve con precisión arbitraria. `fast-check` 4.10.2 (solo desarrollo) genera miles de casos por prueba —ceros, negativos, valores enormes, fechas límite— y reduce cualquier fallo al ejemplo mínimo.
- **Consecuencias.** La división redondeada se calcula con enteros y resto exacto, así que nunca hay doble redondeo. ESLint prohíbe importar `decimal.js` fuera del motor.

## D9 — Invariantes de `Money` y política de redondeo (7 oct 2026)

- Todo `Money` tiene como máximo 4 decimales y cabe en NUMERIC(20,4): cualquier instancia se puede guardar tal cual. Crear un monto con más decimales es un error (`TOO_MANY_DECIMALS`), no un redondeo silencioso.
- Sumar y restar es exacto. Multiplicar, dividir y convertir redondean a 4 decimales con un modo explícito; por defecto `half_up` (empates lejos de cero), el redondeo comercial habitual y el que aplica PostgreSQL a NUMERIC. `half_even`, `down`, `up`, `floor` y `ceil` están disponibles cuando una regla lo exija.
- Se guarda con 4 decimales y solo se redondea para mostrar (decisión A3), con `formatMoney` (COP sin decimales, USD con 2). Ninguna pantalla redondea por su cuenta.
- Las tasas se guardan con 10 decimales. En una conversión inversa (COP→USD con una tasa USD/COP) el monto se calcula dividiendo de forma exacta; la tasa invertida que se guarda es informativa y puede diferir en el último decimal.
- Repartos (cuotas): método del mayor resto en la unidad visible de la moneda; la suma de las partes es siempre exactamente el total.

## D10 — Semántica del saldo inicial y de los pendientes (7 oct 2026)

- `opening_balance` es el saldo **al inicio** del día `opening_balance_date`. Cuentan los movimientos de ese día en adelante; los anteriores se excluyen (el saldo inicial ya los incluye) y se informan en `excluded.beforeOpening` para que la UI pueda advertirlo. F4 deberá avisar al registrar un movimiento anterior al saldo inicial.
- No existe saldo antes de esa fecha (`DATE_BEFORE_OPENING_BALANCE`).
- El saldo se devuelve en tres partes: asentado, efecto de pendientes y actual (= asentado + pendientes). Anulados y borrados nunca cuentan.
- En pasivos (tarjeta, préstamo) el saldo es lo que se debe: una compra lo aumenta y un abono lo reduce.
- La fecha de corte es obligatoria: «hoy» depende de la zona horaria del usuario y lo decide quien llama.

## D11 — Clasificación del flujo de caja (7 oct 2026)

- Ingreso: `income`. Gasto: `expense` y `fee`. Los reembolsos (`refund`) reducen el gasto del período en que llegan y de su categoría; no son ingreso. Por eso el gasto neto puede ser negativo si llega el reembolso de una compra de otro mes, y se muestra tal cual.
- No son ingreso ni gasto: `transfer` (entre cuentas propias), `payment` (abono a tarjeta o crédito; el gasto se contó al comprar, decisión 2 de la auditoría) e `investment`. Se cuentan en `excluded`.
- Se usa el monto base guardado en cada movimiento (tasa del día del movimiento): el pasado no cambia cuando cambia la tasa.
- Los pendientes cuentan o no según `includePending`; siempre se informa cuántos hubo.
- Los intereses de un crédito deberán registrarse como `fee`/`expense` aparte del abono a capital (F6).

## D12 — Vocabulario del libro definido en el dominio (7 oct 2026)

Los tipos de cuenta y de movimiento, direcciones, estados, métodos de pago, orígenes y tipos de categoría se definen una sola vez en `@cf/domain`, y los enums de PostgreSQL (`@cf/db`) se generan a partir de esas listas. El cambio no altera el esquema (verificado con `drizzle-kit generate`: sin migración). `LIABILITY_ACCOUNT_TYPES` se movió de `@cf/db` a `@cf/domain`.
