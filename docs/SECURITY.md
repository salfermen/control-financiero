# Seguridad

La información financiera es altamente sensible. Prioridad: integridad, seguridad y confiabilidad por encima de velocidad o estética (§70 de `AGENTS.md`).

## Controles implementados

| Área                    | Control                                                                                                                                                                                                                                             | Verificado por                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Contraseñas             | Argon2id (19 MiB, t=2, p=1, mínimo OWASP); rehash automático si se endurece la política. Mínimo 12 caracteres, máximo 128, sin reglas de composición (NIST 800-63B); no puede contener el correo.                                                   | `auth.policies.test.ts`, `auth.int.test.ts`       |
| Enumeración de usuarios | Mismo mensaje para correo inexistente y contraseña incorrecta; verificación contra hash ficticio para igualar tiempos.                                                                                                                              | `auth.int.test.ts`                                |
| Fuerza bruta            | Bloqueo progresivo por cuenta (5 fallos → 15 min, duplicando hasta 24 h) con incremento atómico; rate limit estricto en login/registro por IP.                                                                                                      | `auth.int.test.ts`, `security.int.test.ts`        |
| Sesiones                | Token opaco de 256 bits; en la base solo su SHA-256. Vencimiento absoluto e inactividad. Revocación individual y global. Usuarios deshabilitados pierden acceso al instante.                                                                        | `auth.int.test.ts`                                |
| Cookies                 | `httpOnly`, `SameSite=Lax`, `Secure` obligatoria en producción.                                                                                                                                                                                     | `auth.int.test.ts`, E2E                           |
| CSRF                    | Cabecera propia obligatoria en métodos que modifican datos con cookie + CORS con lista blanca.                                                                                                                                                      | `security.int.test.ts`                            |
| Autorización            | Guard global: toda ruta exige sesión salvo `@Public()`. Consultas filtradas por `user_id`; FK compuesta impide mezclar datos entre usuarios a nivel de base.                                                                                        | `security.int.test.ts`, `schema.int.test.ts`      |
| Entrada                 | Zod en el borde de la API, consultas parametrizadas (Drizzle), límite de cuerpo de 1 MB.                                                                                                                                                            | `platform.int.test.ts`                            |
| Cabeceras               | CSP restrictiva, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS en producción, sin `x-powered-by`.                                                                                                                       | `security.int.test.ts`                            |
| Errores                 | Respuesta estándar sin stack traces ni detalles internos.                                                                                                                                                                                           | `platform.int.test.ts`                            |
| Logs                    | JSON estructurado; contraseñas, cookies, tokens y Authorization redactados.                                                                                                                                                                         | `security.int.test.ts`                            |
| Privacidad              | IP seudonimizada (HMAC); consentimiento versionado; borrado de usuario en cascada.                                                                                                                                                                  | `auth.int.test.ts`, `schema.int.test.ts`          |
| Auditoría               | `audit_logs` de solo inserción (trigger); registra registro, login, fallos, bloqueos, logout y cambios de ajustes, sin secretos.                                                                                                                    | `auth.int.test.ts`, `schema.int.test.ts`          |
| Aislamiento de datos    | Toda consulta financiera filtra por el usuario de la sesión; un id ajeno o mal formado responde 404 (no revela si existe). Un movimiento no puede apuntar a la cuenta de otro usuario ni usar otra moneda (FK compuesta).                           | `finance.int.test.ts`                             |
| Integridad financiera   | Cada movimiento se valida con el Financial Engine antes de escribirse y la base lo verifica otra vez (`CHECK`). Auditoría de altas, cambios y borrados de cuentas y movimientos (sin montos ni secretos).                                           | `finance.int.test.ts`, `engine.int.test.ts`       |
| Datos externos          | La TRM se obtiene de una fuente oficial pública, sin credenciales; tiempo de espera, límites de uso y respuestas inválidas se manejan como errores tipados y nunca se guardan datos dudosos. El token opcional de datos.gov.co solo vive en `.env`. | `datos-gov-co-trm.test.ts`, `fx-sync.int.test.ts` |
| Secretos                | `.env` ignorado por Git; configuración validada al arrancar sin imprimir valores; escaneo de secretos (gitleaks) y auditoría de dependencias en CI.                                                                                                 | CI                                                |

## Decisiones y riesgos aceptados

- **Registro revela si un correo existe** (`EMAIL_TAKEN`). Se acepta con rate limit estricto hasta tener verificación por correo; entonces se responderá de forma genérica.
- **`ACCOUNT_LOCKED` revela que la cuenta existe** después de 5 intentos sobre ella. Se prefiere informar al usuario legítimo del bloqueo.
- **IP real detrás de proxies**: la API solo confía en `X-Forwarded-For` de los proxies listados en `TRUST_PROXY`. El proxy de la web de Next.js conserva el `X-Forwarded-For` que recibe; si la web se expone directamente a Internet sin un reverse proxy que lo sobrescriba, un cliente podría falsear su IP para el rate limit (no para autenticarse; el bloqueo por cuenta sigue aplicando). En producción: reverse proxy delante que fije `X-Forwarded-For` (ver DEPLOYMENT.md).
- **Rate limit en memoria**: correcto con una instancia de API. Con varias instancias se necesitará un almacén compartido.
- **Auditoría de dependencias**: se ignora explícitamente `GHSA-vfj7-8cjw-p6xm` (braces, solo en el linter de desarrollo, sin versión corregida). Existe una advertencia moderada de esbuild dentro de `drizzle-kit` (herramienta de desarrollo). Ninguna llega al código en ejecución.
- **Datos de pruebas**: las utilidades de prueba se niegan a borrar bases cuyo nombre no contenga `test`.

## Pendiente (planificado)

| Fase | Control                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4+  | Verificación de correo y recuperación de contraseña.                                                                                                      |
| F11  | Cifrado AES-256-GCM de tokens bancarios con clave rotable; nunca credenciales bancarias.                                                                  |
| F12  | Consentimiento específico para enviar datos a un proveedor de IA.                                                                                         |
| F13  | Exportación completa de datos del usuario y borrado de cuenta desde la interfaz (con período de gracia).                                                  |
| F15  | MFA (TOTP), RLS de PostgreSQL como segunda barrera, CSP con nonce en la web, almacén compartido para rate limit, monitoreo y alertas, respaldos probados. |

## Reportar un problema

Si encuentras una vulnerabilidad, no abras un issue público: escribe al responsable del proyecto con los pasos para reproducirla.
