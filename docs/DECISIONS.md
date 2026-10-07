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
