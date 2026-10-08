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

## D13 — TRM oficial desde datos abiertos del Gobierno (7 oct 2026)

- **Contexto.** §7 pide tasas de un proveedor confiable, con histórico, fuente y manejo de fallos. Para USD/COP la referencia legal en Colombia es la TRM que certifica la Superintendencia Financiera.
- **Decisión.** Proveedor `superfinanciera-trm`: conjunto de datos «Tasa de Cambio Representativa del Mercado - Histórico» (`32sa-8pi3`) de datos.gov.co, API pública sin credenciales (token de aplicación opcional). Se guarda `vigenciadesde` como `rate_date` y `vigenciahasta` como `valid_until`.
- **Verificación pendiente.** El entorno donde se construyó el proyecto no tiene salida a datos.gov.co (bloqueo de red de la organización), así que el formato de respuesta se implementó según la documentación pública del conjunto y se probó con respuestas simuladas. La primera verificación real es `pnpm fx:sync` en el equipo de desarrollo. Si el formato difiere, el proveedor responde `invalid_response` (nunca guarda datos dudosos).
- **Otras monedas.** Sin proveedor automático por ahora: valor cobrado o tasa escrita por la persona. Un proveedor adicional se añade implementando `ExchangeRateProvider`.

## D14 — Conversión automática: vigencia, antigüedad máxima y marca de estimación (7 oct 2026)

- Se usa la tasa que rige ese día (`rate_date ≤ fecha ≤ valid_until`). Si la última publicada ya no rige, se acepta hasta 5 días después (festivos y puentes); más antigua, se pide el valor cobrado o la tasa.
- Un monto convertido con una tasa (TRM o manual) se marca `fx.estimated = true`; con el valor cobrado por el banco, `false`. La UI lo muestra («≈ estimado»).
- En una transferencia entre monedas, la pata que llega guarda como original lo que salió y como conversión el valor recibido o la tasa: queda trazable cuánto salió, cuánto llegó y con qué tasa.

## D15 — Qué se puede corregir en un movimiento (7 oct 2026)

- Gastos, ingresos y comisiones: descripción, categoría, fecha, comercio, medio de pago, notas, estado y, si no hubo cambio de moneda, el monto. Con cambio de moneda, el monto no se edita: se elimina y se registra de nuevo (evita tasas incoherentes).
- Transferencias, pagos y reembolsos: solo descripción, notas y estado (en ambas patas). Lo demás se corrige eliminando y registrando de nuevo.
- Un gasto con reembolsos no se elimina ni puede quedar por debajo de lo reembolsado o después de sus reembolsos.
- Borrado lógico (`deleted_at`) siempre; una transferencia se borra con sus dos patas.

## D16 — Datos de la web: lectura en el servidor, escritura desde el cliente (7 oct 2026)

- Las páginas leen con Server Components (`serverApi`), que reenvían la cookie a la API: sin estados intermedios con datos a medias y con el contrato validado.
- Los formularios escriben con `apiRequest` y refrescan la ruta.
- Consecuencia: las lecturas del servidor llegan a la API desde la IP del servidor web. En producción el proxy inverso debe fijar `X-Forwarded-For` (ver DEPLOYMENT). En las E2E se sube `RATE_LIMIT_MAX` porque toda la suite comparte esa IP.

## D17 — Hoy y lo programado (7 oct 2026)

- **Contexto.** Al registrar el sueldo como saldo inicial del día de pago y sus gastos con fechas futuras, la cuenta mostraba el saldo a la fecha del saldo inicial (sin los gastos del día siguiente) y no había forma de ver «cuánto me queda».
- **Decisión.** Un movimiento con fecha posterior a hoy es _programado_: nunca entra en el saldo de hoy y se informa aparte (`scheduled`); `projected = current + scheduled` es lo que quedará. Una cuenta cuyo saldo inicial es futuro (`startsOn`) no tiene saldo hoy (0) y su saldo inicial cuenta como programado. El motor ya no rechaza fechas de corte anteriores al saldo inicial.
- **Horizonte.** Cada cuenta proyecta todo lo registrado (con la fecha del último movimiento); el tablero proyecta hasta fin de mes y cuenta aparte lo posterior. Las recurrencias (F5b) añadirán movimientos estimados distinguibles de los registrados.

## D18 — Presupuestos con vigencia (7 oct 2026)

- Mensuales, en la moneda base, globales o por categoría de gasto con sus subcategorías. Cuentan gastos + comisiones − reembolsos con el monto base del día de cada movimiento; pendientes sí, anulados y borrados no.
- El nivel de alerta (75 %, 90 %, 100 %) usa lo comprometido (gastado + programado): avisar antes es más seguro. El ritmo (`pace`) extrapola lo gastado hasta hoy desde el día 7 del período; es una estimación, se presenta como tal y nunca baja de lo comprometido.
- Cambiar el límite no reescribe meses pasados (§52): se cierra la versión vigente al final del mes anterior y se abre otra. La base impide versiones solapadas con una restricción de exclusión.
- Con presupuestos, la moneda base queda bloqueada (como con movimientos).

## D19 — Posición consolidada sin tasas inventadas (7 oct 2026)

- Disponible = cuentas corrientes, de ahorro, efectivo y billeteras. El cupo de una tarjeta nunca es disponible (§18); las inversiones son activo pero no liquidez.
- Las cuentas en otra moneda se convierten con la tasa que rige hoy (también su proyección). Con una tasa vencida dentro del margen de D14 el total se marca `estimated`; sin tasa o más vieja, la cuenta se lista en `unconverted` y no se suma.
- Las cuentas marcadas «no incluir en el patrimonio» quedan fuera de todos los totales y se listan.

## D20 — Categorías propias (7 oct 2026)

- Dos niveles como máximo: una categoría propia puede colgar de una principal (del sistema o propia) del mismo tipo. El tipo no cambia después de creada.
- Nombres únicos por tipo sin distinguir mayúsculas, tildes ni idioma (no se puede crear «videojuegos» ni «Video games» si existe «Videojuegos»).
- Eliminar es borrado lógico. Con movimientos se exige `moveTo` y se reasignan en la misma transacción; con subcategorías o con un presupuesto vigente desde este mes se rechaza. Las del sistema no se modifican.
