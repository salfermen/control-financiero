/**
 * @cf/shared — contratos compartidos entre API, web y (desde F14) móvil:
 * esquemas Zod de entrada, tipos de respuesta y códigos de error.
 */
export * from './errors.js';
export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/reference.js';
export * from './schemas/money.js';
export * from './schemas/accounts.js';
export * from './schemas/transactions.js';
export * from './schemas/fx.js';
export * from './schemas/categories.js';
export * from './schemas/budgets.js';
export * from './schemas/summary.js';
export * from './zod-issues.js';
