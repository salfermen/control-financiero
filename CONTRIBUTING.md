# Cómo contribuir

Antes de tocar código, lee [`AGENTS.md`](AGENTS.md). Las reglas absolutas (§3) aplican a todo cambio: no inventar datos, no usar coma flotante para dinero, no exponer secretos, no dejar funcionalidades falsas.

## Flujo

1. Rama desde `main`: `feat/…`, `fix/…`, `refactor/…`, `test/…`, `docs/…`.
2. Cambios pequeños y coherentes.
3. Antes de abrir el PR: `pnpm check` (formato, build, lint, tipos, unitarias e integración) y, si tocaste web o auth, `pnpm test:e2e`.
4. Commits descriptivos (§45):

```text
feat: add financial accounts
fix: correct currency conversion
test: add budget calculation tests
docs: update architecture
```

## Criterio de terminado (§47)

Una funcionalidad está terminada cuando tiene, según corresponda: modelo de datos con migración, lógica en el dominio, endpoint validado con esquema compartido, manejo de errores, UI con estados (carga, vacío, error, sin conexión), seguridad revisada, pruebas (normales y casos límite) y documentación actualizada.

## Convenciones

- **Dinero:** montos como `string` decimal o `Decimal`; cálculos solo en `@cf/domain` (Financial Engine, F3). ESLint prohíbe `parseFloat`.
- **Fechas contables:** texto `YYYY-MM-DD`; nunca `new Date('2026-10-31')` para una fecha sin hora.
- **Contratos:** cada entrada y salida de la API tiene un esquema Zod en `@cf/shared`, usado por la API, la documentación y los clientes.
- **Errores:** lanza `AppError(code)`; nunca respondas texto libre ni detalles internos.
- **Base de datos:** solo con migraciones (`pnpm db:new-migration`). Las reglas de integridad van también en la base (`CHECK`, FK, índices únicos).
- **Rutas nuevas:** exigen sesión por defecto; `@Public()` solo con motivo.
- **Dependencias:** justifica cada una (§38); versiones exactas (`saveExact` en `pnpm-workspace.yaml`).
- **Secretos en pruebas:** solo datos ficticios. Si gitleaks marca uno, añade `// gitleaks:allow (clave ficticia de prueba)` al final de **esa línea**; nunca lo uses para un valor real ni para silenciar archivos enteros. Las huellas de commits ya publicados van en `.gitleaksignore`. Si un secreto real llega a Git, rótalo de inmediato: borrarlo del código no basta.
- **Idioma:** código y nombres técnicos en inglés; mensajes al usuario y documentación en español.
