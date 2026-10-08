import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { monthRange } from '../dates/date-range.js';
import type { DomainError } from '../errors.js';
import type { LedgerEntry } from '../ledger/entry.js';
import { Money } from '../money/money.js';
import { positiveAmount } from '../test-support/arbitraries.js';
import { testEntry, testUsdPurchase } from '../test-support/ledger-fixtures.js';
import {
  type BudgetDefinition,
  type CategoryNode,
  budgetLevel,
  computeBudgetStatuses,
  sortBudgetStatuses,
} from './budget.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

const categories: CategoryNode[] = [
  { id: 'entertainment', parentId: null, kind: 'expense' },
  { id: 'video_games', parentId: 'entertainment', kind: 'expense' },
  { id: 'retro', parentId: 'video_games', kind: 'expense' },
  { id: 'food', parentId: null, kind: 'expense' },
  { id: 'salary', parentId: null, kind: 'income' },
];
const options = {
  period: monthRange('2026-10'),
  asOf: '2026-10-07',
  baseCurrency: 'COP',
  categories,
};
const budget = (overrides: Partial<BudgetDefinition> = {}): BudgetDefinition => ({
  id: 'b-ent',
  categoryId: 'entertainment',
  amount: '300000',
  currency: 'COP',
  ...overrides,
});
const spend = (amount: string, categoryId: string | null, extra: Partial<LedgerEntry> = {}) =>
  testEntry({ amount, categoryId, transactionDate: '2026-10-05', ...extra });

describe('estado de un presupuesto mensual', () => {
  it('suma la categoría y todas sus subcategorías', () => {
    const [status] = computeBudgetStatuses(
      [budget()],
      [
        spend('100000', 'entertainment'),
        spend('50000', 'video_games'),
        spend('30000', 'retro'),
        spend('999999', 'food'),
        spend('1', null),
      ],
      options,
    );
    expect(status?.spent.toAmountString()).toBe('180000.0000');
    expect(status?.remaining.toAmountString()).toBe('120000.0000');
    expect(status?.usedRatio).toBe('0.6000');
    expect(status?.level).toBe('ok');
    expect(status?.counted).toBe(3);
    expect(status?.categoryIds).toEqual(['entertainment', 'video_games', 'retro']);
  });

  it('el presupuesto global incluye todo gasto, también sin categoría', () => {
    const [status] = computeBudgetStatuses(
      [budget({ id: 'b-all', categoryId: null, amount: '1000000' })],
      [spend('100000', 'food'), spend('5000', null), spend('20000', 'video_games')],
      options,
    );
    expect(status?.spent.toAmountString()).toBe('125000.0000');
    expect(status?.categoryIds).toEqual([]);
  });

  it('reembolsos restan; comisiones suman; transferencias, pagos e ingresos no cuentan', () => {
    const [status] = computeBudgetStatuses(
      [budget({ categoryId: null })],
      [
        spend('100000', 'food'),
        spend('8000', 'food', { type: 'fee' }),
        spend('30000', 'food', { type: 'refund', direction: 'inflow', refundOfId: 'x' }),
        spend('500000', null, { type: 'transfer', transferGroupId: 'g' }),
        spend('400000', null, { type: 'payment', transferGroupId: 'p' }),
        spend('2900000', 'salary', { type: 'income', direction: 'inflow' }),
      ],
      options,
    );
    expect(status?.spent.toAmountString()).toBe('78000.0000');
    expect(status?.counted).toBe(3);
  });

  it('usa el monto en moneda base guardado (compras en dólares)', () => {
    const [status] = computeBudgetStatuses(
      [budget()],
      [testUsdPurchase({ categoryId: 'video_games', transactionDate: '2026-10-02' })],
      options,
    );
    expect(status?.spent.toAmountString()).toBe('242959.5000');
    expect(status?.level).toBe('notice'); // 81 %
  });

  it('separa lo programado y alerta con lo comprometido', () => {
    const [status] = computeBudgetStatuses(
      [budget()],
      [
        spend('150000', 'video_games'),
        spend('162000', 'video_games', { transactionDate: '2026-10-31' }),
      ],
      options,
    );
    expect(status?.spent.toAmountString()).toBe('150000.0000');
    expect(status?.scheduled.toAmountString()).toBe('162000.0000');
    expect(status?.committed.toAmountString()).toBe('312000.0000');
    expect(status?.spentRatio).toBe('0.5000');
    expect(status?.usedRatio).toBe('1.0400');
    expect(status?.remaining.toAmountString()).toBe('-12000.0000');
    expect(status?.level).toBe('exceeded');
  });

  it('ignora otros meses, anulados y borrados; los pendientes cuentan', () => {
    const [status] = computeBudgetStatuses(
      [budget()],
      [
        spend('1', 'entertainment', { transactionDate: '2026-09-30' }),
        spend('1', 'entertainment', { transactionDate: '2026-11-01' }),
        spend('1', 'entertainment', { status: 'void' }),
        spend('1', 'entertainment', { deletedAt: new Date('2026-10-06T00:00:00Z') }),
        spend('70000', 'entertainment', { status: 'pending' }),
      ],
      options,
    );
    expect(status?.spent.toAmountString()).toBe('70000.0000');
    expect(status?.counted).toBe(1);
  });
});

describe('orden para mostrar', () => {
  it('global primero; luego de mayor a menor uso exacto; empates por id', () => {
    const statuses = computeBudgetStatuses(
      [
        budget({ id: 'b-food', categoryId: 'food', amount: '300' }),
        budget({ id: 'b-ent', categoryId: 'entertainment', amount: '900' }),
        budget({ id: 'b-all', categoryId: null, amount: '100000' }),
        budget({ id: 'b-a-ent', categoryId: 'entertainment', amount: '300' }),
      ],
      [spend('100', 'food'), spend('301', 'video_games')],
      options,
    );
    // food: 100/300 = 0,3333…; ent 900: 301/900 = 0,33444…; ent 300: 301/300 > 1.
    expect(sortBudgetStatuses(statuses).map((s) => s.budgetId)).toEqual([
      'b-all',
      'b-a-ent',
      'b-ent',
      'b-food',
    ]);
    const tie = computeBudgetStatuses([budget({ id: 'b2' }), budget({ id: 'b1' })], [], options);
    expect(sortBudgetStatuses(tie).map((s) => s.budgetId)).toEqual(['b1', 'b2']);
  });
});

describe('niveles de alerta', () => {
  const limit = Money.of('300000', 'COP');
  it.each([
    ['0', 'ok'],
    ['224999.9999', 'ok'],
    ['225000', 'notice'],
    ['269999.9999', 'notice'],
    ['270000', 'warning'],
    ['299999.9999', 'warning'],
    ['300000', 'exceeded'],
    ['450000', 'exceeded'],
    ['-5000', 'ok'],
  ])('%s de 300.000 → %s', (used, level) => {
    expect(budgetLevel(Money.of(used, 'COP'), limit)).toBe(level);
  });

  it('el umbral es exacto aunque el límite no sea redondo', () => {
    const odd = Money.of('0.0003', 'COP');
    // 75 % de 0,0003 = 0,000225 → hace falta 0,0003 para alcanzarlo con 4 decimales.
    expect(budgetLevel(Money.of('0.0002', 'COP'), odd)).toBe('ok');
    expect(budgetLevel(Money.of('0.0003', 'COP'), odd)).toBe('exceeded');
    expect(code(() => budgetLevel(Money.of('1', 'COP'), Money.zero('COP')))).toBe(
      'NON_POSITIVE_AMOUNT',
    );
  });
});

describe('ritmo de gasto (estimación)', () => {
  it('extrapola lo gastado hasta hoy y lo marca si supera el límite', () => {
    const [status] = computeBudgetStatuses([budget()], [spend('100000', 'entertainment')], {
      ...options,
      asOf: '2026-10-10',
    });
    expect(status?.pace).toMatchObject({ daysElapsed: 10, daysInPeriod: 31, exceedsLimit: true });
    expect(status?.pace?.projectedSpend.toAmountString()).toBe('310000.0000');
  });

  it('lo programado comprometido manda si es mayor que el ritmo', () => {
    const [status] = computeBudgetStatuses(
      [budget()],
      [
        spend('10000', 'entertainment'),
        spend('250000', 'entertainment', { transactionDate: '2026-10-25' }),
      ],
      { ...options, asOf: '2026-10-15' },
    );
    expect(status?.pace?.projectedSpend.toAmountString()).toBe('20666.6667');
    expect(status?.pace?.projectedClose.toAmountString()).toBe('260000.0000');
    expect(status?.pace?.exceedsLimit).toBe(false);
  });

  it('no estima en los primeros días, fuera del período ni el último día', () => {
    const entries = [spend('1000', 'entertainment', { transactionDate: '2026-10-01' })];
    const at = (asOf: string) =>
      computeBudgetStatuses([budget()], entries, { ...options, asOf })[0]?.pace;
    expect(at('2026-10-06')).toBeNull();
    expect(at('2026-10-07')).not.toBeNull();
    expect(at('2026-10-31')).toBeNull();
    expect(at('2026-11-02')).toBeNull();
    expect(at('2026-09-20')).toBeNull();
  });

  it('sin gasto, el ritmo es cero', () => {
    const [status] = computeBudgetStatuses([budget()], [], { ...options, asOf: '2026-10-20' });
    expect(status?.pace?.projectedSpend.isZero()).toBe(true);
    expect(status?.level).toBe('ok');
  });
});

describe('validaciones', () => {
  it('rechaza presupuestos inválidos', () => {
    expect(code(() => computeBudgetStatuses([budget({ currency: 'USD' })], [], options))).toBe(
      'CURRENCY_MISMATCH',
    );
    expect(code(() => computeBudgetStatuses([budget({ amount: '0' })], [], options))).toBe(
      'NON_POSITIVE_AMOUNT',
    );
    expect(code(() => computeBudgetStatuses([budget({ categoryId: 'nope' })], [], options))).toBe(
      'INVALID_CATEGORY',
    );
    expect(code(() => computeBudgetStatuses([budget({ categoryId: 'salary' })], [], options))).toBe(
      'INVALID_CATEGORY',
    );
  });

  it('rechaza árboles de categorías inconsistentes', () => {
    const run = (tree: CategoryNode[]) =>
      code(() => computeBudgetStatuses([], [], { ...options, categories: tree }));
    expect(run([categories[0] as CategoryNode, categories[0] as CategoryNode])).toBe(
      'INVALID_CATEGORY',
    );
    expect(run([{ id: 'a', parentId: 'missing', kind: 'expense' }])).toBe('INVALID_CATEGORY');
    expect(
      run([
        { id: 'a', parentId: null, kind: 'income' },
        { id: 'b', parentId: 'a', kind: 'expense' },
      ]),
    ).toBe('INVALID_CATEGORY');
    expect(
      run([
        { id: 'a', parentId: 'b', kind: 'expense' },
        { id: 'b', parentId: 'a', kind: 'expense' },
      ]),
    ).toBe('INVALID_CATEGORY');
  });

  it('rechaza movimientos en otra moneda base o inválidos, y fechas inválidas', () => {
    expect(
      code(() =>
        computeBudgetStatuses(
          [budget()],
          [testEntry({ baseCurrency: 'USD', accountCurrency: 'USD', originalCurrency: 'USD' })],
          options,
        ),
      ),
    ).toBe('CURRENCY_MISMATCH');
    expect(code(() => computeBudgetStatuses([], [spend('-1', null)], options))).toBe(
      'INVALID_LEDGER_ENTRY',
    );
    expect(code(() => computeBudgetStatuses([], [], { ...options, asOf: 'hoy' }))).toBe(
      'INVALID_DATE',
    );
    expect(code(() => computeBudgetStatuses([], [], { ...options, baseCurrency: 'XYZ' }))).toBe(
      'UNSUPPORTED_CURRENCY',
    );
  });
});

describe('propiedad: lo comprometido es la suma exacta de lo que aplica', () => {
  it('global = suma de gastos − reembolsos del período; restante = límite − comprometido', () => {
    const movement = fc.record({
      amount: positiveAmount,
      kind: fc.constantFrom('expense', 'fee', 'refund', 'transfer'),
      day: fc.integer({ min: 1, max: 31 }),
    });
    fc.assert(
      fc.property(fc.array(movement, { maxLength: 40 }), positiveAmount, (movements, limit) => {
        const entries = movements.map((m) =>
          testEntry({
            type: m.kind,
            direction: m.kind === 'refund' ? 'inflow' : 'outflow',
            amount: m.amount,
            transactionDate: `2026-10-${String(m.day).padStart(2, '0')}`,
            ...(m.kind === 'refund' ? { refundOfId: 'x' } : {}),
            ...(m.kind === 'transfer' ? { transferGroupId: 'g' } : {}),
          }),
        );
        const [status] = computeBudgetStatuses(
          [budget({ categoryId: null, amount: limit })],
          entries,
          options,
        );
        let expected = Money.zero('COP');
        for (const m of movements) {
          if (m.kind === 'transfer') continue;
          const amount = Money.of(m.amount, 'COP');
          expected = m.kind === 'refund' ? expected.minus(amount) : expected.plus(amount);
        }
        expect(status?.committed.equals(expected)).toBe(true);
        expect(status?.spent.plus(status.scheduled).equals(expected)).toBe(true);
        expect(status?.remaining.equals(Money.of(limit, 'COP').minus(expected))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
