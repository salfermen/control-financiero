# INSTRUCCIONES MAESTRAS DEL AGENTE DE DESARROLLO
## Plataforma Financiera Personal Inteligente

> Este archivo define las reglas operativas que debe seguir el agente de desarrollo durante todo el proyecto.
> Debe leerse antes de modificar código y mantenerse como referencia permanente.

---

# 1. MISIÓN DEL AGENTE

Tu misión es desarrollar y mantener una **plataforma financiera personal inteligente, completa, modular, segura y preparada para producción**.

No debes tratar el proyecto como una demo, prototipo universitario ni simple gestor de gastos.

La aplicación debe permitir, como mínimo:

- Control de ingresos.
- Control de gastos.
- Presupuestos.
- Cuentas y saldos.
- Tarjetas de crédito.
- Deudas.
- Pagos y cuotas.
- Gastos recurrentes.
- Suscripciones.
- Metas financieras.
- Patrimonio neto.
- Calendario financiero.
- Proyecciones.
- Simulaciones.
- Recomendaciones de compra.
- Conversión de monedas.
- Tasas de cambio actualizadas.
- Información de mercado.
- Comparación de precios.
- Comparación de videojuegos y productos.
- Listas de deseos.
- Alertas de precio.
- Importación y exportación de información.
- Integraciones bancarias cuando exista una API/Open Banking apropiada.
- Automatizaciones.
- Notificaciones.
- Asistente de IA.
- Reportes.
- Auditoría.
- Seguridad y privacidad.
- Arquitectura preparada para web, móvil y eventualmente escritorio.

El objetivo es construir una aplicación que pueda evolucionar hasta convertirse en un producto financiero personal real.

---

# 2. PRINCIPIO FUNDAMENTAL

La prioridad del proyecto es:

1. **Exactitud financiera**
2. **Integridad de los datos**
3. **Seguridad**
4. **Arquitectura sólida**
5. **Automatización**
6. **Experiencia de usuario**
7. **Estética**

Una interfaz bonita nunca debe ocultar una lógica financiera incorrecta.

Es preferible mostrar:

> "Información temporalmente no disponible"

que mostrar un valor inventado.

---

# 3. REGLAS ABSOLUTAS

Debes cumplir siempre las siguientes reglas:

- No inventar datos.
- No inventar precios.
- No inventar tasas de cambio.
- No inventar saldos.
- No inventar movimientos bancarios.
- No inventar deudas.
- No inventar rendimientos.
- No inventar información proveniente de APIs externas.
- No ocultar errores.
- No utilizar valores financieros hardcodeados sin justificación.
- No dejar funcionalidades críticas como simples placeholders.
- No implementar botones que aparenten funcionar si realmente no tienen lógica.
- No eliminar funcionalidad existente sin justificarlo.
- No romper funcionalidades existentes.
- No modificar arquitectura importante sin analizar primero sus consecuencias.
- No agregar dependencias innecesarias.
- No duplicar lógica financiera.
- No usar números de punto flotante para cálculos monetarios sensibles.
- No guardar secretos en el código.
- No exponer API keys en el frontend.
- No almacenar credenciales bancarias directamente.
- No realizar scraping de servicios financieros cuando exista una integración oficial apropiada.
- No asumir que una API externa siempre estará disponible.
- No considerar una funcionalidad terminada únicamente porque compila.

---

# 4. ANTES DE MODIFICAR EL PROYECTO

Antes de escribir o modificar código debes inspeccionar el proyecto.

Analiza:

- Estructura de carpetas.
- Framework utilizado.
- Lenguaje.
- `package.json`.
- `pnpm-lock.yaml`, `package-lock.json` o equivalente.
- Configuración de TypeScript.
- Configuración del frontend.
- Configuración del backend.
- Base de datos.
- ORM.
- Migraciones.
- Variables de entorno.
- Archivos `.md`.
- Documentación.
- Scripts.
- Tests existentes.
- APIs existentes.
- Servicios externos.
- Autenticación.
- Autorización.
- Componentes reutilizables.
- Estado global.
- Manejo de errores.
- Logging.
- CI/CD.
- Configuración de despliegue.
- Problemas técnicos conocidos.

También debes identificar:

- código duplicado;
- deuda técnica;
- vulnerabilidades evidentes;
- malas prácticas;
- inconsistencias;
- módulos incompletos;
- funcionalidades falsas;
- cálculos financieros incorrectos;
- problemas de arquitectura;
- problemas de rendimiento;
- problemas de seguridad.

**No empieces modificando código inmediatamente.**

Primero comprende el sistema.

---

# 5. PRIMERA FASE OBLIGATORIA: AUDITORÍA

Cuando recibas un proyecto existente, la primera tarea debe ser únicamente una auditoría.

No debes implementar funcionalidades nuevas durante esta fase.

Debes producir un diagnóstico que incluya:

## Arquitectura actual

- Frontend.
- Backend.
- Base de datos.
- Servicios.
- APIs.
- Autenticación.
- Infraestructura.

## Estado actual

- Qué funciona.
- Qué está incompleto.
- Qué está roto.
- Qué está mal diseñado.
- Qué puede reutilizarse.

## Riesgos

- Seguridad.
- Datos.
- Finanzas.
- APIs.
- Dependencias.
- Escalabilidad.

## Plan

Crear un plan de implementación ordenado por prioridad.

No comenzar la implementación hasta terminar esta auditoría.

---

# 6. FORMA DE TRABAJO

El proyecto debe desarrollarse de manera incremental.

No intentes crear cientos de archivos y funcionalidades simultáneamente.

Trabaja siguiendo esta secuencia:

1. Auditoría.
2. Arquitectura.
3. Base de datos.
4. Sistema de autenticación.
5. Núcleo financiero.
6. Cuentas.
7. Ingresos.
8. Gastos.
9. Categorías.
10. Presupuestos.
11. Transacciones recurrentes.
12. Deudas.
13. Tarjetas de crédito.
14. Metas.
15. Calendario financiero.
16. Patrimonio.
17. Motor de proyecciones.
18. Simuladores.
19. Tasas de cambio.
20. Datos de mercado.
21. Comparador de precios.
22. Videojuegos y productos.
23. Lista de deseos.
24. Alertas.
25. Integraciones bancarias.
26. Automatizaciones.
27. IA.
28. Notificaciones.
29. Reportes.
30. Importación/exportación.
31. Aplicación móvil.
32. Seguridad avanzada.
33. Observabilidad.
34. Optimización.
35. Preparación para producción.

Puedes trabajar varios puntos relacionados dentro de una misma fase cuando tenga sentido, pero no debes saltar prematuramente a funcionalidades avanzadas si el núcleo financiero todavía no es confiable.

---

# 7. ARQUITECTURA GENERAL

La arquitectura debe ser modular y escalable.

Como referencia preferente:

### Frontend

- React.
- Next.js cuando sea apropiado.
- TypeScript.
- Tailwind CSS o sistema de diseño equivalente.
- Gestión de estado apropiada.
- Formularios con validación.
- Componentes reutilizables.

### Backend

Preferentemente:

- Node.js.
- TypeScript.
- NestJS, Express o Fastify según las necesidades reales del proyecto.

### Base de datos

Preferentemente:

- PostgreSQL.

ORM:

- Prisma.
- Drizzle.
- O una alternativa justificada.

### Mobile

Preparar la arquitectura para:

- React Native.
- Expo.

### Desktop

Si posteriormente es necesario:

- Tauri.
- Electron.

No es obligatorio utilizar todas estas tecnologías.

Debes elegir la alternativa más adecuada para el proyecto actual y justificar cambios importantes.

---

# 8. MODELO DE DATOS

La base de datos debe diseñarse pensando en la plataforma completa, no únicamente en los módulos iniciales.

Como referencia, debe poder soportar entidades como:

- users
- profiles
- accounts
- account_balances
- transactions
- categories
- income
- expenses
- recurring_transactions
- budgets
- debts
- debt_payments
- credit_cards
- credit_card_statements
- subscriptions
- goals
- goal_contributions
- currencies
- exchange_rates
- market_data
- investments
- investment_transactions
- products
- stores
- price_history
- price_comparisons
- game_prices
- forecasts
- recommendations
- notifications
- bank_connections
- bank_accounts
- bank_transactions
- ai_conversations
- ai_messages
- audit_logs
- imports
- exports
- automation_rules

No debes crear tablas únicamente porque aparecen en esta lista.

Debes adaptar el modelo a las necesidades reales y mantenerlo normalizado, consistente y extensible.

---

# 9. FINANCIAL ENGINE

Debe existir un **Financial Engine** o núcleo financiero central.

Este será la fuente de verdad para los cálculos financieros.

Debe centralizar, cuando corresponda:

- Saldos.
- Ingresos.
- Gastos.
- Flujo de caja.
- Presupuestos.
- Deudas.
- Tarjetas.
- Cuotas.
- Metas.
- Patrimonio.
- Conversión de monedas.
- Proyecciones.
- Simulaciones.

No permitas que cada pantalla implemente sus propios cálculos financieros.

La UI debe consultar la lógica financiera central.

---

# 10. DINERO Y PRECISIÓN

Los cálculos monetarios deben utilizar:

- Decimal.
- Enteros en unidades menores cuando sea apropiado.
- Tipos monetarios seguros.

No utilizar `float` para cálculos financieros críticos.

Ejemplo conceptual:

```text
100000 COP
+
25000 COP
=
125000 COP
```

Debe evitarse cualquier situación en la que un cálculo termine produciendo errores de precisión binaria.

También debes considerar:

- redondeos;
- impuestos;
- comisiones;
- intereses;
- descuentos;
- conversiones;
- cuotas;
- valores negativos;
- valores cero;
- cantidades extremadamente grandes.

---

# 11. MULTIMONEDA

La aplicación debe soportar múltiples monedas.

La moneda base puede ser COP, pero el sistema debe poder trabajar con:

- COP.
- USD.
- EUR.
- GBP.
- JPY.
- Otras monedas configurables.

Cada operación debe conservar, cuando corresponda:

- monto original;
- moneda original;
- moneda destino;
- tasa utilizada;
- fecha/hora de conversión;
- fuente de la tasa;
- monto convertido.

No reemplazar el valor original por el valor convertido.

---

# 12. TASAS DE CAMBIO

Las tasas de cambio deben obtenerse mediante proveedores externos apropiados.

El sistema debe:

- identificar la fuente;
- guardar timestamp;
- guardar la tasa;
- almacenar histórico;
- manejar caché;
- detectar datos antiguos;
- manejar timeouts;
- manejar límites de API;
- manejar respuestas inválidas;
- manejar indisponibilidad del proveedor.

Nunca inventar una tasa.

Si la información está desactualizada, indicarlo claramente.

---

# 13. FECHAS Y TIEMPO

Los sistemas financieros son sensibles a las fechas.

Diferenciar correctamente:

- fecha de transacción;
- fecha de registro;
- fecha de contabilización;
- fecha del extracto;
- fecha de vencimiento;
- fecha de pago;
- fecha de sincronización;
- fecha de creación.

Considerar:

- zona horaria;
- fin de mes;
- años bisiestos;
- cambios de mes;
- fechas futuras;
- fechas pasadas.

Evitar errores causados por conversiones automáticas de timezone.

---

# 14. INGRESOS Y GASTOS

El sistema debe permitir registrar:

### Ingresos

- salario;
- freelance;
- ventas;
- intereses;
- inversiones;
- ingresos extraordinarios;
- otros.

### Gastos

- alimentación;
- transporte;
- vivienda;
- educación;
- entretenimiento;
- tecnología;
- servicios;
- suscripciones;
- salud;
- compras;
- otros.

Las categorías deben ser configurables.

Cada transacción debe poder almacenar información suficiente para análisis posteriores.

---

# 15. GASTOS RECURRENTES

Debe existir un sistema para:

- mensual;
- semanal;
- quincenal;
- anual;
- personalizado.

Debe poder estimar gastos futuros.

Ejemplo:

```text
Netflix
$X
Cada mes
Próximo cobro: fecha
```

El sistema debe diferenciar entre:

- gasto confirmado;
- gasto programado;
- gasto estimado.

---

# 16. PRESUPUESTOS

Los presupuestos deben poder establecerse por:

- categoría;
- periodo;
- cuenta;
- objetivo.

El sistema debe calcular:

- presupuesto;
- gasto actual;
- porcentaje utilizado;
- saldo disponible;
- proyección de cierre.

Debe alertar cuando:

- se acerca al límite;
- supera el límite;
- la tendencia indica que probablemente lo superará.

---

# 17. DEUDAS

Debe existir un módulo completo de deuda.

Debe permitir:

- deuda total;
- saldo pendiente;
- tasa;
- cuotas;
- fecha de vencimiento;
- pago mínimo;
- pago adicional;
- historial.

Debe soportar estrategias:

### Avalanche

Priorizar deuda con mayor interés.

### Snowball

Priorizar deuda con menor saldo.

### Personalizada

Permitir que el usuario defina prioridades.

Las recomendaciones deben explicar por qué se propone una estrategia.

---

# 18. TARJETAS DE CRÉDITO

El sistema debe manejar:

- límite;
- saldo utilizado;
- saldo disponible;
- fecha de corte;
- fecha de pago;
- pago mínimo;
- pago total;
- intereses;
- compras;
- cuotas;
- extractos.

Debe evitar confundir:

> saldo disponible

con:

> dinero libre real.

Una tarjeta de crédito representa una obligación, no ingreso disponible.

---

# 19. METAS FINANCIERAS

Permitir crear metas como:

- comprar computador;
- viajar;
- fondo de emergencia;
- pagar deuda;
- comprar videojuego;
- ahorrar determinada cantidad.

Cada meta debe tener:

- nombre;
- objetivo;
- cantidad actual;
- fecha objetivo;
- contribuciones;
- progreso;
- proyección.

---

# 20. PATRIMONIO NETO

Calcular:

```text
Patrimonio neto =
Activos - Pasivos
```

Considerar:

### Activos

- cuentas;
- efectivo;
- inversiones;
- otros activos configurados.

### Pasivos

- tarjetas;
- préstamos;
- deudas.

Debe existir histórico para observar la evolución.

---

# 21. PROYECCIONES

El sistema debe poder proyectar:

- saldo futuro;
- ingresos;
- gastos;
- flujo de caja;
- capacidad de ahorro;
- cumplimiento de metas;
- deuda.

Cuando corresponda, mostrar escenarios:

- optimista;
- probable;
- pesimista.

Las proyecciones deben incluir:

- supuestos;
- periodo;
- datos utilizados;
- incertidumbre.

Nunca presentar una predicción como una certeza.

---

# 22. SIMULADOR FINANCIERO

Debe existir un sistema de escenarios "¿Qué pasa si...?".

Ejemplos:

- ¿Qué pasa si compro esto?
- ¿Qué pasa si aumento el ahorro?
- ¿Qué pasa si pago más de mi deuda?
- ¿Qué pasa si pierdo un ingreso?
- ¿Qué pasa si el dólar cambia?
- ¿Qué pasa si aumento un gasto mensual?
- ¿Qué pasa si compro a cuotas?

Las simulaciones no deben modificar los datos reales salvo que el usuario confirme explícitamente una acción.

---

# 23. "¿PUEDO COMPRAR ESTO?"

Debe existir una herramienta que evalúe una compra.

Debe considerar, cuando existan datos suficientes:

- dinero disponible;
- gastos comprometidos;
- gastos recurrentes;
- ingresos futuros;
- deudas;
- tarjetas;
- presupuesto;
- metas;
- ahorro;
- precio actual;
- comportamiento histórico;
- impacto futuro.

El resultado debe ser explicable.

Ejemplo conceptual:

```text
Compra: $800.000

Disponible actual: $2.500.000
Gastos comprometidos: $1.200.000
Ahorro objetivo: $500.000

Resultado:
No recomendable actualmente.

Motivo:
La compra reduciría el margen de seguridad por debajo
del objetivo definido.
```

No debe limitarse a decir "sí" o "no".

---

# 24. COMPARADOR DE PRECIOS

Debe existir una arquitectura para comparar precios entre diferentes tiendas y proveedores.

Especialmente:

- videojuegos;
- software;
- hardware;
- tecnología;
- productos configurables.

Para videojuegos considerar plataformas como:

- Steam;
- Epic Games Store;
- GOG;
- PlayStation;
- Xbox;
- Nintendo;
- otras fuentes disponibles oficialmente.

La información debe mostrar:

- tienda;
- producto;
- precio;
- moneda;
- precio convertido;
- descuentos;
- fecha de consulta;
- fuente.

Nunca inventar precios.

---

# 25. HISTORIAL DE PRECIOS

Guardar histórico cuando sea posible.

Permitir analizar:

- precio actual;
- precio mínimo conocido;
- precio máximo;
- promedio;
- tendencia;
- descuentos;
- historial.

Esto permite responder:

> "¿Está barato actualmente?"

con datos, no con intuición.

---

# 26. LISTA DE DESEOS

El usuario debe poder guardar productos.

Una entrada puede contener:

- producto;
- precio objetivo;
- precio actual;
- tienda;
- prioridad;
- fecha;
- notas.

Debe poder generar alertas cuando:

```text
precio_actual <= precio_objetivo
```

---

# 27. DATOS DE MERCADO

La plataforma debe poder integrar datos financieros externos cuando sean relevantes.

Por ejemplo:

- monedas;
- índices;
- acciones;
- fondos;
- otros activos permitidos.

Separar claramente:

- información real;
- información retrasada;
- estimaciones;
- simulaciones.

Mostrar siempre la fuente y fecha cuando corresponda.

---

# 28. INTEGRACIONES BANCARIAS

Si se implementan integraciones bancarias:

- utilizar APIs oficiales;
- utilizar Open Banking cuando esté disponible;
- utilizar OAuth;
- no almacenar contraseñas bancarias;
- no almacenar credenciales innecesarias;
- cifrar información sensible;
- utilizar tokens de forma segura;
- registrar sincronizaciones.

Las transacciones importadas deben ser idempotentes.

Evitar duplicados utilizando identificadores externos cuando estén disponibles.

---

# 29. IA FINANCIERA

La IA debe funcionar como una capa inteligente sobre el sistema financiero.

No debe convertirse en la fuente de verdad.

La IA debe consultar herramientas internas como:

```text
get_balance()
get_accounts()
get_income()
get_expenses()
get_budgets()
get_debts()
get_credit_cards()
get_goals()
get_forecast()
get_exchange_rate()
get_prices()
get_price_history()
```

La IA debe basar sus respuestas en datos obtenidos del sistema.

Nunca debe inventar información financiera.

---

# 30. EXPLICABILIDAD DE LA IA

Toda recomendación importante debe poder explicar:

1. Qué detectó.
2. Qué datos utilizó.
3. Qué cálculo realizó.
4. Qué conclusión obtuvo.
5. Qué incertidumbre existe.

Ejemplo:

```text
Recomendación: esperar para comprar.

Datos utilizados:
- Precio actual.
- Precio histórico.
- Presupuesto disponible.
- Gastos próximos.

Motivo:
El precio actual está por encima del promedio histórico
y la compra reduciría el margen disponible este mes.
```

---

# 31. AUTOMATIZACIONES

Debe existir una arquitectura de reglas.

Ejemplos:

```text
SI gasto_categoria > presupuesto
ENTONCES crear alerta
```

```text
SI precio_producto <= precio_objetivo
ENTONCES notificar usuario
```

```text
SI fecha_vencimiento se aproxima
ENTONCES notificar usuario
```

```text
SI saldo < límite configurado
ENTONCES generar alerta
```

Las automatizaciones deben poder habilitarse/deshabilitarse.

---

# 32. NOTIFICACIONES

Preparar soporte para:

- alertas financieras;
- vencimientos;
- presupuestos;
- precios;
- metas;
- deudas;
- sincronizaciones;
- anomalías.

Evitar notificaciones innecesarias o repetitivas.

---

# 33. IMPORTACIÓN Y EXPORTACIÓN

Permitir importar/exportar información mediante:

- CSV;
- XLSX;
- JSON;
- PDF cuando sea apropiado.

Las importaciones deben:

- validar estructura;
- validar tipos;
- detectar errores;
- detectar duplicados;
- permitir previsualización;
- generar reporte de errores.

Nunca importar datos inválidos silenciosamente.

---

# 34. UI/UX

La aplicación debe ser moderna, limpia y profesional.

Debe ser:

- responsive;
- mobile-first;
- accesible;
- rápida;
- intuitiva.

El registro de un gasto debe poder realizarse rápidamente.

Debe existir una jerarquía clara entre:

- saldo;
- ingresos;
- gastos;
- obligaciones;
- metas;
- alertas.

Evitar dashboards saturados.

---

# 35. ESTADOS DE UI

Toda funcionalidad debe contemplar:

- loading;
- éxito;
- error;
- vacío;
- sin conexión;
- datos desactualizados;
- permisos insuficientes.

No mostrar pantallas vacías sin explicación.

---

# 36. SEGURIDAD

Aplicar defensa en profundidad.

Considerar:

- autenticación segura;
- autorización;
- validación de entrada;
- sanitización;
- protección contra inyección;
- protección XSS;
- protección CSRF cuando aplique;
- rate limiting;
- CORS correctamente configurado;
- headers de seguridad;
- gestión segura de sesiones;
- cifrado;
- manejo seguro de secretos;
- logs sin información sensible;
- auditoría.

Nunca colocar secretos en:

- Git;
- frontend;
- código fuente;
- screenshots;
- logs;
- documentación pública.

---

# 37. VARIABLES DE ENTORNO

Utilizar `.env`.

Debe existir:

```text
.env
.env.example
```

Nunca subir `.env` real al repositorio.

Cada nueva variable debe documentarse en `.env.example`.

Ejemplo:

```env
DATABASE_URL=
API_KEY=
EXTERNAL_PROVIDER_URL=
```

Nunca escribir valores reales de secretos en `.env.example`.

---

# 38. DEPENDENCIAS

Antes de instalar una dependencia nueva:

1. Verificar si realmente es necesaria.
2. Revisar si el proyecto ya tiene una alternativa.
3. Evaluar mantenimiento.
4. Evaluar compatibilidad.
5. Evaluar seguridad.
6. Evitar duplicar librerías que solucionan el mismo problema.

No agregar paquetes por comodidad cuando una solución simple ya existe.

---

# 39. API Y SERVICIOS EXTERNOS

Toda integración externa debe estar encapsulada.

Preferir:

```text
Provider
    ↓
Service
    ↓
Business Logic
    ↓
API
    ↓
Frontend
```

No colocar llamadas directas a proveedores externos por todo el frontend.

Debe existir manejo de:

- timeout;
- retry cuando corresponda;
- rate limit;
- errores;
- respuestas incompletas;
- datos inválidos;
- proveedor caído;
- caché;
- datos antiguos.

---

# 40. TESTING

Cada módulo financiero debe tener pruebas.

Como mínimo probar:

- conversiones;
- saldos;
- ingresos;
- gastos;
- presupuestos;
- deudas;
- intereses;
- tarjetas;
- cuotas;
- metas;
- patrimonio;
- recurrencias;
- proyecciones;
- simulaciones;
- recomendaciones.

También probar casos límite:

- cero;
- negativos;
- valores enormes;
- valores faltantes;
- duplicados;
- monedas diferentes;
- fin de mes;
- años bisiestos;
- cambios de timezone;
- fechas futuras;
- fechas pasadas.

---

# 41. VALIDACIÓN

La validación debe existir tanto en:

- frontend;
- backend;
- base de datos cuando corresponda.

Nunca confiar únicamente en la validación del frontend.

---

# 42. MIGRACIONES

Los cambios de base de datos deben realizarse mediante migraciones controladas.

Nunca modificar producción manualmente sin un procedimiento documentado.

Toda migración debe considerar:

- compatibilidad;
- datos existentes;
- rollback cuando sea posible;
- índices;
- rendimiento.

---

# 43. RENDIMIENTO

Evitar:

- consultas innecesarias;
- N+1 queries;
- cálculos repetidos;
- cargas masivas innecesarias;
- renders innecesarios.

Utilizar:

- paginación;
- caché;
- índices;
- consultas eficientes;
- procesamiento asíncrono cuando corresponda.

No optimizar prematuramente.

Medir antes de realizar optimizaciones complejas.

---

# 44. DOCUMENTACIÓN

Mantener actualizada la documentación.

Como mínimo:

```text
README.md
ARCHITECTURE.md
DATABASE.md
API.md
ENVIRONMENT.md
SECURITY.md
```

La documentación debe reflejar el estado real del sistema.

No documentar funcionalidades que no existen.

---

# 45. GIT

Utilizar commits descriptivos.

Ejemplos:

```text
feat: add financial accounts
feat: implement debt engine
fix: correct currency conversion
fix: prevent duplicate transactions
refactor: centralize financial calculations
test: add budget calculation tests
docs: update architecture
```

No realizar commits gigantescos cuando puedan dividirse lógicamente.

---

# 46. VERIFICACIÓN DESPUÉS DE CADA MÓDULO

Después de implementar un módulo:

1. Ejecutar lint.
2. Ejecutar typecheck.
3. Ejecutar tests unitarios.
4. Ejecutar tests de integración cuando corresponda.
5. Ejecutar build.
6. Revisar errores.
7. Revisar regresiones.
8. Revisar seguridad.
9. Revisar documentación.

No acumular errores para "arreglarlos al final".

---

# 47. CRITERIO DE "TERMINADO"

Una funcionalidad NO está terminada simplemente porque:

- compila;
- aparece en pantalla;
- existe un endpoint;
- existe una tabla.

Debe tener, cuando corresponda:

- modelo de datos;
- lógica de negocio;
- API;
- validación;
- manejo de errores;
- frontend;
- estados de UI;
- seguridad;
- tests;
- documentación.

---

# 48. NO ROMPER EL PROYECTO

Antes de modificar una funcionalidad existente:

- entender cómo funciona;
- revisar dependencias;
- identificar consumidores;
- ejecutar tests relacionados.

Después:

- verificar regresiones;
- verificar build;
- verificar comportamiento.

Si encuentras una implementación incorrecta, no la reemplaces a ciegas.

Primero determina qué partes dependen de ella.

---

# 49. CAMBIOS ARQUITECTÓNICOS

Antes de realizar cambios importantes como:

- cambiar ORM;
- cambiar base de datos;
- cambiar framework;
- mover módulos;
- cambiar autenticación;
- cambiar estructura de API;
- introducir microservicios;

debes explicar:

- problema actual;
- solución propuesta;
- ventajas;
- riesgos;
- impacto;
- migración necesaria.

No introducir microservicios por moda.

Una arquitectura modular monolítica puede ser preferible mientras el producto no necesite otra cosa.

---

# 50. OBSERVABILIDAD

Preparar el sistema para producción con:

- logs estructurados;
- monitoreo;
- métricas;
- tracking de errores;
- health checks;
- auditoría.

Los logs nunca deben incluir:

- contraseñas;
- API keys;
- tokens;
- información bancaria sensible;
- secretos.

---

# 51. BACKUPS

La arquitectura debe considerar:

- backups;
- recuperación;
- integridad de datos;
- migraciones;
- restauración.

No asumir que una base de datos es segura únicamente porque existe.

---

# 52. PRODUCCIÓN

Antes de considerar el sistema listo para producción, verificar:

- HTTPS;
- autenticación;
- autorización;
- secrets;
- variables de entorno;
- backups;
- migraciones;
- rate limiting;
- CORS;
- headers;
- logging;
- monitoring;
- error tracking;
- validación;
- tests;
- build;
- documentación.

---

# 53. REGLA CONTRA DATOS FALSOS

Durante desarrollo pueden utilizarse mocks únicamente cuando sean necesarios para:

- tests;
- desarrollo local;
- demostraciones internas.

Deben estar claramente identificados.

Nunca presentar mocks como datos reales.

---

# 54. REGLA CONTRA FUNCIONALIDADES FALSAS

No crear:

```text
<button>Comparar precios</button>
```

si realmente no existe un comparador.

No crear:

```text
<button>Sincronizar banco</button>
```

si todavía no existe la integración.

Si una funcionalidad no está implementada, debe indicarse claramente.

---

# 55. INTELIGENCIA FINANCIERA

La aplicación debe distinguir:

### Datos reales

Información obtenida de registros del usuario o fuentes verificadas.

### Datos estimados

Valores calculados a partir de supuestos.

### Predicciones

Resultados de modelos o proyecciones.

### Recomendaciones

Conclusiones generadas utilizando datos y reglas.

Nunca mezclar estas categorías sin indicarlo.

---

# 56. RECOMENDACIONES

Toda recomendación financiera debe incluir suficiente contexto para entenderla.

Ejemplo:

```text
Recomendación:
Esperar.

Datos:
- Precio actual.
- Promedio histórico.
- Presupuesto.
- Gastos próximos.
- Meta financiera.

Razón:
La compra actualmente reduce demasiado el margen
disponible para los gastos comprometidos.
```

Nunca presentar una recomendación como verdad absoluta.

---

# 57. PRIVACIDAD

La información financiera es sensible.

Aplicar:

- mínimo privilegio;
- aislamiento de usuarios;
- acceso únicamente a datos autorizados;
- auditoría;
- cifrado cuando corresponda;
- eliminación segura;
- minimización de datos.

Un usuario nunca debe poder consultar información financiera de otro usuario.

---

# 58. PRINCIPIO DE FUENTE ÚNICA

Siempre que exista un dato financiero centralizado, debe existir una fuente de verdad.

Ejemplo:

No tener:

```text
Dashboard.balance
Profile.balance
Account.balance
AI.balance
```

como valores independientes.

Debe existir una fuente financiera central y el resto debe consultar esa información.

---

# 59. ORDEN DE IMPLEMENTACIÓN

El orden recomendado es:

```text
AUDITORÍA
    ↓
ARQUITECTURA
    ↓
BASE DE DATOS
    ↓
AUTENTICACIÓN
    ↓
FINANCIAL ENGINE
    ↓
CUENTAS
    ↓
INGRESOS / GASTOS
    ↓
PRESUPUESTOS
    ↓
DEUDAS / TARJETAS
    ↓
METAS / PATRIMONIO
    ↓
CALENDARIO
    ↓
PROYECCIONES
    ↓
SIMULACIONES
    ↓
TASAS DE CAMBIO
    ↓
MERCADO
    ↓
COMPARADOR DE PRECIOS
    ↓
WISHLIST / ALERTAS
    ↓
BANCA
    ↓
AUTOMATIZACIONES
    ↓
IA
    ↓
REPORTES
    ↓
IMPORTACIÓN / EXPORTACIÓN
    ↓
MOBILE
    ↓
SEGURIDAD / OBSERVABILIDAD
    ↓
PRODUCCIÓN
```

---

# 60. PRIMERA INSTRUCCIÓN QUE DEBES RECIBIR

Cuando este archivo se agregue a un proyecto existente, la primera tarea debe ser:

```text
Comienza únicamente con la auditoría del proyecto.

No modifiques código todavía.

Analiza el repositorio completo:
- arquitectura;
- tecnologías;
- dependencias;
- base de datos;
- variables de entorno;
- documentación;
- funcionalidades existentes;
- APIs;
- autenticación;
- tests;
- configuración;
- riesgos;
- problemas;
- deuda técnica.

Determina qué está correctamente implementado,
qué está incompleto y qué debe modificarse.

Después entrega:

1. Diagnóstico técnico.
2. Arquitectura actual.
3. Problemas encontrados.
4. Riesgos.
5. Recomendaciones.
6. Arquitectura objetivo.
7. Modelo de datos propuesto.
8. Plan de implementación por fases.
9. Orden recomendado de trabajo.

No comiences la implementación hasta terminar esta auditoría.
```

---

# 61. SEGUNDA INSTRUCCIÓN

Una vez aprobada la auditoría:

```text
Ahora implementa únicamente la arquitectura base y el modelo de datos.

No avances todavía hacia:
- IA;
- bancos;
- APIs de mercado;
- comparador de precios;
- funcionalidades avanzadas.

Primero deja sólida la infraestructura sobre la que se construirá
todo el sistema.

Implementa:
- estructura del proyecto;
- configuración;
- base de datos;
- migraciones;
- modelos;
- autenticación base;
- validación;
- manejo de errores;
- configuración de entorno;
- testing inicial;
- documentación base.

Después ejecuta:
- lint;
- typecheck;
- tests;
- build.

No continúes si existen errores críticos.
```

---

# 62. TERCERA INSTRUCCIÓN: NÚCLEO FINANCIERO

Después de tener la infraestructura estable:

```text
Implementa ahora el Financial Engine.

Debe convertirse en la fuente central de verdad financiera.

Implementa y prueba:
- cuentas;
- saldos;
- transacciones;
- ingresos;
- gastos;
- categorías;
- conversiones;
- flujo de caja.

No implementes todavía:
- IA;
- banca;
- comparación de precios;
- funcionalidades secundarias.

Todos los cálculos deben estar centralizados y utilizar
manejo monetario seguro.

Agrega pruebas para casos normales y casos límite.

Ejecuta lint, typecheck, tests y build.
```

---

# 63. REGLA DE PROGRESIÓN

No avanzar a un módulo avanzado si el módulo del que depende todavía presenta errores críticos.

Ejemplo:

No implementar recomendaciones de IA si:

```text
Financial Engine
```

todavía calcula mal los saldos.

No implementar recomendaciones de compra si:

```text
ingresos
gastos
deudas
presupuestos
```

todavía no están correctamente integrados.

---

# 64. CUANDO ENCUENTRES UN PROBLEMA

No ocultarlo.

Debes informar:

```text
Problema encontrado:
...

Impacto:
...

Causa probable:
...

Solución propuesta:
...

Riesgo:
...

¿Bloquea el desarrollo?:
Sí/No
```

---

# 65. CUANDO FALTE INFORMACIÓN

No inventar.

Si necesitas información externa:

- buscar una fuente confiable;
- consultar una API;
- utilizar documentación oficial;
- indicar que la información no está disponible.

Si no existe información suficiente:

```text
Información insuficiente para determinar el resultado.
```

es una respuesta válida.

---

# 66. COMPORTAMIENTO ESPERADO DEL AGENTE

Debes actuar como:

- arquitecto de software;
- desarrollador full-stack;
- ingeniero de datos;
- especialista en automatización;
- especialista en seguridad;
- especialista en sistemas financieros personales;
- ingeniero de IA cuando corresponda.

Pero debes evitar sobreingeniería.

La solución debe ser:

```text
simple
+
modular
+
segura
+
testeable
+
escalable
```

---

# 67. RESUMEN OPERATIVO

Antes de modificar:

```text
INSPECCIONAR
↓
COMPRENDER
↓
PLANEAR
↓
IMPLEMENTAR
↓
PROBAR
↓
VERIFICAR
↓
DOCUMENTAR
```

Nunca:

```text
CODIFICAR
↓
ROMPER
↓
INTENTAR ARREGLAR
↓
ESPERAR QUE FUNCIONE
```

---

# 68. INFORME FINAL DE CADA SESIÓN

Al terminar una tarea importante, entregar:

## Implementado

Lista de funcionalidades terminadas.

## Modificado

Archivos o módulos importantes modificados.

## Base de datos

Cambios realizados.

## Tests

Tests ejecutados y resultado.

## Build

Resultado del build.

## Seguridad

Problemas encontrados o corregidos.

## Pendientes

Elementos que todavía faltan.

## Riesgos

Problemas que requieren atención.

## Próximo paso

Indicar exactamente cuál debe ser la siguiente tarea.

---

# 69. CRITERIO FINAL DEL PROYECTO

El resultado final debe sentirse como una verdadera plataforma financiera personal.

No como:

- una calculadora;
- un CRUD de gastos;
- un dashboard estático;
- una demo;
- un proyecto académico básico.

Debe ser un sistema integrado donde:

```text
DATOS
  ↓
FINANCIAL ENGINE
  ↓
ANÁLISIS
  ↓
PROYECCIONES
  ↓
AUTOMATIZACIÓN
  ↓
IA
  ↓
RECOMENDACIONES
  ↓
ACCIONES
```

Todo debe estar conectado de forma coherente.

---

# 70. PRINCIPIO SUPREMO

Cuando exista conflicto entre:

- velocidad y exactitud;
- estética y seguridad;
- comodidad y consistencia;
- automatización y control;
- funcionalidad y estabilidad;

prioriza:

> **Integridad financiera, seguridad y confiabilidad.**

Una aplicación financiera puede ser visualmente excelente y aun así ser un mal producto si sus números no son confiables.

La regla definitiva es:

> **Nunca inventar, nunca ocultar, nunca asumir cuando los datos pueden verificarse y nunca sacrificar la precisión financiera por terminar más rápido.**

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
