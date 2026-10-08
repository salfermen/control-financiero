import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { monthRange } from '../dates/date-range.js';
import type { DomainError } from '../errors.js';
import { Money } from '../money/money.js';
import { positiveAmount } from '../test-support/arbitraries.js';
import { testEntry, testUsdPurchase } from '../test-support/ledger-fixtures.js';
import { REQUIRED_DIRECTION, TRANSACTION_TYPES } from './constants.js';
import { computeCashFlow } from './cash-flow.js';
import type { LedgerEntry } from './entry.js';

const october = { period: monthRange('2026-10'), baseCurrency: 'COP', includePending: true };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

const income = (amount: string, extra: Partial<LedgerEntry> = {}) =>
  testEntry({ type: 'income', direction: 'inflow', amount, categoryId: 'salary', ...extra });
const expense = (amount: string, categoryId: string | null, extra: Partial<LedgerEntry> = {}) =>
  testEntry({ amount, categoryId, ...extra });

describe('flujo de caja mensual', () => {
  const entries = [
    income('2900000', { transactionDate: '2026-10-30' }),
    expense('800000', 'housing', { transactionDate: '2026-10-01' }),
    expense('350000', 'food'),
    expense('120000', 'video_games'),
    testUsdPurchase({ categoryId: 'video_games' }), // 59,99 USD → 242.959,5 COP
    testEntry({ type: 'fee', amount: '15000', categoryId: 'fees' }),
    testEntry({
      type: 'refund',
      direction: 'inflow',
      amount: '20000',
      categoryId: 'food',
      refundOfId: 'x',
    }),
    // No son ingreso ni gasto:
    testEntry({ type: 'transfer', direction: 'outflow', amount: '500000', transferGroupId: 'g1' }),
    testEntry({
      type: 'transfer',
      direction: 'inflow',
      amount: '500000',
      transferGroupId: 'g1',
      accountId: 'acc-savings',
    }),
    testEntry({ type: 'payment', direction: 'outflow', amount: '400000', transferGroupId: 'g2' }),
    testEntry({ type: 'investment', direction: 'outflow', amount: '100000' }),
  ];
  const flow = computeCashFlow(entries, october);

  it('separa ingresos, gastos, comisiones y reembolsos', () => {
    expect(flow.income.toAmountString()).toBe('2900000.0000');
    expect(flow.expenses.toAmountString()).toBe('1512959.5000');
    expect(flow.fees.toAmountString()).toBe('15000.0000');
    expect(flow.refunds.toAmountString()).toBe('20000.0000');
    expect(flow.netExpenses.toAmountString()).toBe('1507959.5000');
    expect(flow.net.toAmountString()).toBe('1392040.5000');
    expect(flow.savingsRate).toBe('0.4800');
    expect(flow.counted).toEqual({ income: 1, expense: 4, fee: 1, refund: 1 });
  });

  it('no cuenta transferencias, pagos de tarjeta ni inversiones como gasto', () => {
    expect(flow.excluded).toMatchObject({ transfer: 2, payment: 1, investment: 1 });
  });

  it('agrupa por categoría: ingresos primero, luego gastos de mayor a menor', () => {
    expect(
      flow.byCategory.map((c) => [c.kind, c.categoryId, c.net.toAmountString(), c.count]),
    ).toEqual([
      ['income', 'salary', '2900000.0000', 1],
      ['expense', 'housing', '800000.0000', 1],
      ['expense', 'video_games', '362959.5000', 2],
      ['expense', 'food', '330000.0000', 2],
      ['expense', 'fees', '15000.0000', 1],
    ]);
    const food = flow.byCategory.find((c) => c.categoryId === 'food');
    expect(food?.gross.toAmountString()).toBe('350000.0000');
    expect(food?.refunds.toAmountString()).toBe('20000.0000');
  });

  it('usa el monto base guardado (tasa del día del movimiento), no una tasa nueva', () => {
    const games = flow.byCategory.find((c) => c.categoryId === 'video_games');
    expect(games?.gross.toAmountString()).toBe('362959.5000');
  });
});

describe('reglas de inclusión', () => {
  it('respeta los límites del período, incluido el 29 de febrero', () => {
    const flow = computeCashFlow(
      [
        expense('1', null, { transactionDate: '2028-01-31' }),
        expense('2', null, { transactionDate: '2028-02-01' }),
        expense('3', null, { transactionDate: '2028-02-29' }),
        expense('4', null, { transactionDate: '2028-03-01' }),
      ],
      { ...october, period: monthRange('2028-02') },
    );
    expect(flow.expenses.toAmountString()).toBe('5.0000');
    expect(flow.excluded.outsidePeriod).toBe(2);
  });

  it('puede excluir pendientes y siempre informa cuántos hubo', () => {
    const entries = [expense('100', 'food', { status: 'pending' }), expense('50', 'food')];
    expect(computeCashFlow(entries, october).expenses.toAmountString()).toBe('150.0000');
    const postedOnly = computeCashFlow(entries, { ...october, includePending: false });
    expect(postedOnly.expenses.toAmountString()).toBe('50.0000');
    expect(postedOnly.excluded.pending).toBe(1);
    expect(postedOnly.includePending).toBe(false);
  });

  it('ignora anulados y borrados', () => {
    const flow = computeCashFlow(
      [expense('100', null, { status: 'void' }), expense('100', null, { deletedAt: new Date() })],
      october,
    );
    expect(flow.expenses.isZero()).toBe(true);
    expect(flow.excluded).toMatchObject({ void: 1, deleted: 1 });
  });

  it('un reembolso de un gasto de otro mes puede dejar el gasto neto en negativo', () => {
    const flow = computeCashFlow(
      [
        testEntry({
          type: 'refund',
          direction: 'inflow',
          amount: '90000',
          categoryId: 'tech',
          refundOfId: 'old',
        }),
      ],
      october,
    );
    expect(flow.netExpenses.toAmountString()).toBe('-90000.0000');
    expect(flow.byCategory[0]?.net.toAmountString()).toBe('-90000.0000');
    expect(flow.savingsRate).toBeNull();
  });

  it('sin movimientos, todo es cero y la tasa de ahorro no existe', () => {
    const flow = computeCashFlow([], october);
    expect(flow.net.isZero()).toBe(true);
    expect(flow.savingsRate).toBeNull();
    expect(flow.byCategory).toEqual([]);
  });

  it('gastar más de lo que entra da ahorro negativo', () => {
    const flow = computeCashFlow([income('1000'), expense('1500', 'food')], october);
    expect(flow.net.toAmountString()).toBe('-500.0000');
    expect(flow.savingsRate).toBe('-0.5000');
  });

  it('ordena categorías empatadas de forma estable, sin categoría al final', () => {
    const flow = computeCashFlow(
      [
        expense('10', null),
        expense('10', 'b'),
        expense('10', 'a'),
        expense('10', 'a', { amount: '0.0001' }),
      ],
      october,
    );
    expect(flow.byCategory.map((c) => c.categoryId)).toEqual(['a', 'b', null]);
    const tie = computeCashFlow(
      [expense('10', 'b'), expense('10', 'a'), expense('10', null)],
      october,
    );
    expect(tie.byCategory.map((c) => c.categoryId)).toEqual(['a', 'b', null]);
  });

  it('valida moneda base, período y movimientos', () => {
    expect(
      code(() =>
        computeCashFlow(
          [testEntry({ baseCurrency: 'USD', originalCurrency: 'USD', accountCurrency: 'USD' })],
          october,
        ),
      ),
    ).toBe('CURRENCY_MISMATCH');
    expect(code(() => computeCashFlow([], { ...october, baseCurrency: 'XYZ' }))).toBe(
      'UNSUPPORTED_CURRENCY',
    );
    expect(
      code(() =>
        computeCashFlow([], { ...october, period: { from: '2026-10-31', to: '2026-10-01' } }),
      ),
    ).toBe('INVALID_DATE_RANGE');
    expect(code(() => computeCashFlow([expense('-1', null)], october))).toBe(
      'INVALID_LEDGER_ENTRY',
    );
  });
});

describe('propiedad: el flujo cuadra', () => {
  it('neto = ingresos − (gastos + comisiones − reembolsos) y nada se pierde', () => {
    const anyEntry = fc
      .record({
        type: fc.constantFrom(...TRANSACTION_TYPES),
        inflow: fc.boolean(),
        amount: positiveAmount,
        day: fc.integer({ min: 1, max: 31 }),
        status: fc.constantFrom('posted', 'pending', 'void'),
        category: fc.constantFrom(null, 'a', 'b', 'c'),
      })
      .map(({ type, inflow, amount, day, status, category }) => {
        const required = REQUIRED_DIRECTION[type];
        return testEntry({
          type,
          direction: required ?? (inflow ? 'inflow' : 'outflow'),
          amount,
          status,
          transactionDate: `2026-10-${String(day).padStart(2, '0')}`,
          categoryId: type === 'transfer' ? null : category,
          transferGroupId: type === 'transfer' ? 'g' : null,
        });
      });
    fc.assert(
      fc.property(
        fc.array(anyEntry, { maxLength: 50 }),
        fc.boolean(),
        (entries, includePending) => {
          const flow = computeCashFlow(entries, { ...october, includePending });
          expect(flow.net.equals(flow.income.minus(flow.netExpenses))).toBe(true);
          expect(flow.netExpenses.equals(flow.expenses.plus(flow.fees).minus(flow.refunds))).toBe(
            true,
          );
          const byCategory = Money.sum(
            flow.byCategory.map((c) => (c.kind === 'income' ? c.net.negated() : c.net)),
            'COP',
          );
          expect(byCategory.equals(flow.netExpenses.minus(flow.income))).toBe(true);
          const counted = Object.values(flow.counted).reduce((a, b) => a + b, 0);
          const excluded = Object.values(flow.excluded).reduce((a, b) => a + b, 0);
          expect(counted + excluded).toBe(entries.length);
        },
      ),
      { numRuns: 500 },
    );
  });
});
