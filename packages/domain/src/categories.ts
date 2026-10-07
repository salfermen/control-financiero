/**
 * Categorías del sistema (datos de referencia, no datos de usuario).
 *
 * Cada usuario las ve todas y puede crear las suyas. `key` es estable: se usa en
 * reglas de categorización y no debe cambiar una vez publicada. Los nombres sí
 * pueden traducirse o ajustarse.
 *
 * Las transferencias entre cuentas propias NO llevan categoría: no son ingreso
 * ni gasto (requisito §10 del prompt maestro).
 */
export type CategoryKind = 'income' | 'expense';

export interface SystemCategoryDefinition {
  readonly key: string;
  readonly kind: CategoryKind;
  readonly nameEs: string;
  readonly nameEn: string;
  /** Clave de la categoría padre, si es subcategoría. */
  readonly parentKey?: string;
}

export const SYSTEM_CATEGORIES: readonly SystemCategoryDefinition[] = [
  // Gastos
  { key: 'food', kind: 'expense', nameEs: 'Alimentación', nameEn: 'Food' },
  { key: 'transport', kind: 'expense', nameEs: 'Transporte', nameEn: 'Transport' },
  { key: 'housing', kind: 'expense', nameEs: 'Vivienda', nameEn: 'Housing' },
  { key: 'utilities', kind: 'expense', nameEs: 'Servicios', nameEn: 'Utilities' },
  { key: 'education', kind: 'expense', nameEs: 'Educación', nameEn: 'Education' },
  { key: 'health', kind: 'expense', nameEs: 'Salud', nameEn: 'Health' },
  { key: 'entertainment', kind: 'expense', nameEs: 'Entretenimiento', nameEn: 'Entertainment' },
  {
    key: 'video_games',
    kind: 'expense',
    nameEs: 'Videojuegos',
    nameEn: 'Video games',
    parentKey: 'entertainment',
  },
  { key: 'technology', kind: 'expense', nameEs: 'Tecnología', nameEn: 'Technology' },
  { key: 'subscriptions', kind: 'expense', nameEs: 'Suscripciones', nameEn: 'Subscriptions' },
  { key: 'clothing', kind: 'expense', nameEs: 'Ropa', nameEn: 'Clothing' },
  { key: 'travel', kind: 'expense', nameEs: 'Viajes', nameEn: 'Travel' },
  {
    key: 'debt_costs',
    kind: 'expense',
    nameEs: 'Intereses y costos de deuda',
    nameEn: 'Interest and debt costs',
  },
  { key: 'shopping', kind: 'expense', nameEs: 'Compras', nameEn: 'Shopping' },
  { key: 'other_expense', kind: 'expense', nameEs: 'Otros gastos', nameEn: 'Other expenses' },
  // Ingresos
  { key: 'salary', kind: 'income', nameEs: 'Sueldo', nameEn: 'Salary' },
  { key: 'freelance', kind: 'income', nameEs: 'Freelance', nameEn: 'Freelance' },
  { key: 'bonus', kind: 'income', nameEs: 'Bonos', nameEn: 'Bonuses' },
  { key: 'commissions', kind: 'income', nameEs: 'Comisiones', nameEn: 'Commissions' },
  { key: 'sales', kind: 'income', nameEs: 'Ventas', nameEn: 'Sales' },
  { key: 'interest_income', kind: 'income', nameEs: 'Intereses', nameEn: 'Interest' },
  {
    key: 'investment_income',
    kind: 'income',
    nameEs: 'Rendimientos de inversiones',
    nameEn: 'Investment returns',
  },
  { key: 'other_income', kind: 'income', nameEs: 'Otros ingresos', nameEn: 'Other income' },
] as const;
