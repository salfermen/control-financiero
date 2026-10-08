import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { Money } from '../money/money.js';
import { localDate, positiveAmount } from '../test-support/arbitraries.js';
import { testAccount, testEntry } from '../test-support/ledger-fixtures.js';
import { computeAccountBalance, computeAccountBalances } from './balance.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

describe('saldo de una cuenta de activo', () => {
  const account = testAccount({ openingBalance: '1000000', openingBalanceDate: '2026-10-01' });

  it('suma entradas y resta salidas desde el saldo inicial', () => {
    const balance = computeAccountBalance(
      account,
      [
        testEntry({
          type: 'income',
          direction: 'inflow',
          amount: '2900000',
          transactionDate: '2026-10-01',
        }),
        testEntry({ amount: '150000.50', transactionDate: '2026-10-05' }),
        testEntry({ type: 'fee', amount: '7500', transactionDate: '2026-10-06' }),
      ],
      { asOf: '2026-10-07' },
    );
    expect(balance.nature).toBe('asset');
    expect(balance.opening.toAmountString()).toBe('1000000.0000');
    expect(balance.posted.toAmountString()).toBe('3742499.5000');
    expect(balance.pending.isZero()).toBe(true);
    expect(balance.current.equals(balance.posted)).toBe(true);
    expect(balance.counted).toEqual({ posted: 3, pending: 0, scheduled: 0 });
    expect(balance.startsOn).toBeNull();
    expect(balance.projected.equals(balance.current)).toBe(true);
    expect(balance.projectedThrough).toBeNull();
  });

  it('informa los pendientes aparte y los suma en el saldo actual', () => {
    const balance = computeAccountBalance(
      account,
      [testEntry({ status: 'pending', amount: '50000' })],
      { asOf: '2026-10-07' },
    );
    expect(balance.posted.toAmountString()).toBe('1000000.0000');
    expect(balance.pending.toAmountString()).toBe('-50000.0000');
    expect(balance.current.toAmountString()).toBe('950000.0000');
  });

  it('excluye y cuenta borrados, anulados y anteriores al saldo inicial; separa los futuros', () => {
    const balance = computeAccountBalance(
      account,
      [
        testEntry({ deletedAt: new Date('2026-10-05T00:00:00Z') }),
        testEntry({ status: 'void', transactionDate: '2026-10-20' }),
        testEntry({ transactionDate: '2026-10-08' }),
        testEntry({ transactionDate: '2026-09-30' }),
        testEntry({ transactionDate: '2026-10-07' }),
      ],
      { asOf: '2026-10-07' },
    );
    expect(balance.excluded).toEqual({ deleted: 1, void: 1, beforeOpening: 1, afterProjection: 0 });
    expect(balance.counted).toEqual({ posted: 1, pending: 0, scheduled: 1 });
    expect(balance.posted.toAmountString()).toBe('990000.0000');
    expect(balance.current.toAmountString()).toBe('990000.0000');
    expect(balance.scheduled.toAmountString()).toBe('-10000.0000');
    expect(balance.projected.toAmountString()).toBe('980000.0000');
    expect(balance.projectedThrough).toBe('2026-10-08');
  });

  it('incluye los movimientos del mismo día del saldo inicial y del corte', () => {
    const balance = computeAccountBalance(
      account,
      [
        testEntry({ transactionDate: '2026-10-01', amount: '1' }),
        testEntry({ transactionDate: '2026-10-07', amount: '2' }),
      ],
      { asOf: '2026-10-07' },
    );
    expect(balance.posted.toAmountString()).toBe('999997.0000');
  });

  it('puede quedar en negativo (sobregiro) sin ocultarlo', () => {
    const balance = computeAccountBalance(account, [testEntry({ amount: '1200000' })], {
      asOf: '2026-10-07',
    });
    expect(balance.current.toAmountString()).toBe('-200000.0000');
  });

  it('sin movimientos, el saldo es el inicial', () => {
    const balance = computeAccountBalance(account, [], { asOf: '2026-10-01' });
    expect(balance.current.equals(Money.of('1000000', 'COP'))).toBe(true);
  });

  it('antes de la fecha del saldo inicial, la cuenta no tiene saldo hoy y su inicio es programado', () => {
    const balance = computeAccountBalance(account, [], { asOf: '2026-09-30' });
    expect(balance.startsOn).toBe('2026-10-01');
    expect(balance.current.isZero()).toBe(true);
    expect(balance.posted.isZero()).toBe(true);
    expect(balance.scheduled.toAmountString()).toBe('1000000.0000');
    expect(balance.projected.toAmountString()).toBe('1000000.0000');
    expect(balance.projectedThrough).toBe('2026-10-01');
  });

  it('rechaza movimientos de otra cuenta o en otra moneda', () => {
    expect(
      code(() =>
        computeAccountBalance(account, [testEntry({ accountId: 'otra' })], { asOf: '2026-10-07' }),
      ),
    ).toBe('ACCOUNT_MISMATCH');
    expect(
      code(() =>
        computeAccountBalance(
          account,
          [testEntry({ accountCurrency: 'USD', baseCurrency: 'USD', originalCurrency: 'USD' })],
          {
            asOf: '2026-10-07',
          },
        ),
      ),
    ).toBe('CURRENCY_MISMATCH');
  });

  it('valida la cuenta y la fecha de corte', () => {
    expect(
      code(() =>
        computeAccountBalance(testAccount({ type: 'piggy' as never }), [], { asOf: '2026-10-07' }),
      ),
    ).toBe('INVALID_ACCOUNT');
    expect(
      code(() =>
        computeAccountBalance(testAccount({ openingBalance: '1.00001' }), [], {
          asOf: '2026-10-07',
        }),
      ),
    ).toBe('TOO_MANY_DECIMALS');
    expect(code(() => computeAccountBalance(account, [], { asOf: 'hoy' }))).toBe('INVALID_DATE');
    expect(
      code(() =>
        computeAccountBalance(testAccount({ openingBalanceDate: '2026-02-29' }), [], {
          asOf: '2026-10-07',
        }),
      ),
    ).toBe('INVALID_DATE');
  });

  it('rechaza movimientos que violan las reglas del libro', () => {
    expect(
      code(() =>
        computeAccountBalance(account, [testEntry({ type: 'expense', direction: 'inflow' })], {
          asOf: '2026-10-07',
        }),
      ),
    ).toBe('INVALID_LEDGER_ENTRY');
  });
});

describe('saldo de una tarjeta de crédito (pasivo)', () => {
  const card = testAccount({
    id: 'acc-card',
    type: 'credit_card',
    openingBalance: '1500000',
    openingBalanceDate: '2026-10-01',
  });

  it('las compras aumentan la deuda y los abonos la reducen', () => {
    const balance = computeAccountBalance(
      card,
      [
        testEntry({ accountId: 'acc-card', amount: '300000', transactionDate: '2026-10-03' }),
        testEntry({
          accountId: 'acc-card',
          type: 'payment',
          direction: 'inflow',
          amount: '500000',
          transferGroupId: 'g-1',
          transactionDate: '2026-10-05',
        }),
        testEntry({ accountId: 'acc-card', status: 'pending', amount: '80000' }),
      ],
      { asOf: '2026-10-07' },
    );
    expect(balance.nature).toBe('liability');
    expect(balance.posted.toAmountString()).toBe('1300000.0000');
    expect(balance.pending.toAmountString()).toBe('80000.0000');
    expect(balance.current.toAmountString()).toBe('1380000.0000');
  });
});

describe('lo programado: movimientos futuros y cuentas que empiezan después', () => {
  // Caso real: el sueldo de octubre se registró como saldo inicial del 30 de
  // octubre y los gastos de ese sueldo con fechas del 30 y 31.
  const salary = testAccount({
    id: 'acc-salary',
    type: 'savings',
    openingBalance: '1500000',
    openingBalanceDate: '2026-10-30',
  });
  const salaryEntries = [
    testEntry({ accountId: 'acc-salary', amount: '1000000', transactionDate: '2026-10-30' }),
    testEntry({ accountId: 'acc-salary', amount: '267633', transactionDate: '2026-10-31' }),
    testEntry({ accountId: 'acc-salary', amount: '162000', transactionDate: '2026-10-31' }),
  ];

  it('calcula el sueldo restante después de todo lo programado', () => {
    const balance = computeAccountBalance(salary, salaryEntries, { asOf: '2026-10-07' });
    expect(balance.startsOn).toBe('2026-10-30');
    expect(balance.current.isZero()).toBe(true);
    expect(balance.scheduled.toAmountString()).toBe('70367.0000');
    expect(balance.projected.toAmountString()).toBe('70367.0000');
    expect(balance.projectedThrough).toBe('2026-10-31');
    expect(balance.counted).toEqual({ posted: 0, pending: 0, scheduled: 3 });
  });

  it('el día del inicio, el saldo de hoy y lo programado se separan', () => {
    const balance = computeAccountBalance(salary, salaryEntries, { asOf: '2026-10-30' });
    expect(balance.startsOn).toBeNull();
    expect(balance.current.toAmountString()).toBe('500000.0000');
    expect(balance.scheduled.toAmountString()).toBe('-429633.0000');
    expect(balance.projected.toAmountString()).toBe('70367.0000');
  });

  it('cuando ya pasó todo, lo programado es cero y la proyección es el saldo', () => {
    const balance = computeAccountBalance(salary, salaryEntries, { asOf: '2026-11-01' });
    expect(balance.current.toAmountString()).toBe('70367.0000');
    expect(balance.scheduled.isZero()).toBe(true);
    expect(balance.projectedThrough).toBeNull();
  });

  it('limita la proyección a una fecha y cuenta lo que queda fuera', () => {
    const balance = computeAccountBalance(salary, salaryEntries, {
      asOf: '2026-10-07',
      projectUntil: '2026-10-30',
    });
    expect(balance.projected.toAmountString()).toBe('500000.0000');
    expect(balance.projectUntil).toBe('2026-10-30');
    expect(balance.projectedThrough).toBe('2026-10-30');
    expect(balance.excluded.afterProjection).toBe(2);
  });

  it('una cuenta que empieza después del límite no aporta nada a la proyección', () => {
    const balance = computeAccountBalance(salary, salaryEntries, {
      asOf: '2026-10-07',
      projectUntil: '2026-10-29',
    });
    expect(balance.startsOn).toBe('2026-10-30');
    expect(balance.projected.isZero()).toBe(true);
    expect(balance.projectedThrough).toBeNull();
    expect(balance.excluded.afterProjection).toBe(3);
  });

  it('los pendientes con fecha futura también son programados', () => {
    const account = testAccount({ openingBalance: '100000', openingBalanceDate: '2026-10-01' });
    const balance = computeAccountBalance(
      account,
      [testEntry({ status: 'pending', amount: '30000', transactionDate: '2026-10-15' })],
      { asOf: '2026-10-07' },
    );
    expect(balance.pending.isZero()).toBe(true);
    expect(balance.scheduled.toAmountString()).toBe('-30000.0000');
    expect(balance.projected.toAmountString()).toBe('70000.0000');
  });

  it('en pasivos, lo programado aumenta o reduce la deuda', () => {
    const card = testAccount({
      id: 'acc-card',
      type: 'credit_card',
      openingBalance: '400000',
      openingBalanceDate: '2026-10-01',
    });
    const balance = computeAccountBalance(
      card,
      [
        testEntry({ accountId: 'acc-card', amount: '50000', transactionDate: '2026-10-20' }),
        testEntry({
          accountId: 'acc-card',
          type: 'payment',
          direction: 'inflow',
          amount: '400000',
          transferGroupId: 'g-2',
          transactionDate: '2026-10-25',
        }),
      ],
      { asOf: '2026-10-07' },
    );
    expect(balance.current.toAmountString()).toBe('400000.0000');
    expect(balance.scheduled.toAmountString()).toBe('-350000.0000');
    expect(balance.projected.toAmountString()).toBe('50000.0000');
  });

  it('rechaza un límite de proyección anterior a la fecha de corte', () => {
    expect(
      code(() =>
        computeAccountBalance(salary, [], { asOf: '2026-10-07', projectUntil: '2026-10-06' }),
      ),
    ).toBe('INVALID_DATE_RANGE');
    expect(
      code(() => computeAccountBalance(salary, [], { asOf: '2026-10-07', projectUntil: 'luego' })),
    ).toBe('INVALID_DATE');
  });
});

describe('saldos de varias cuentas', () => {
  it('agrupa los movimientos por cuenta', () => {
    const checking = testAccount({ openingBalance: '100' });
    const cash = testAccount({ id: 'acc-cash', type: 'cash', openingBalance: '50' });
    const balances = computeAccountBalances(
      [checking, cash],
      [
        testEntry({ amount: '10' }),
        testEntry({ accountId: 'acc-cash', amount: '5' }),
        testEntry({ accountId: 'acc-cash', amount: '5' }),
      ],
      { asOf: '2026-10-07' },
    );
    expect(balances.map((b) => [b.accountId, b.current.toAmountString()])).toEqual([
      ['acc-checking', '90.0000'],
      ['acc-cash', '40.0000'],
    ]);
  });

  it('rechaza ids repetidos y movimientos de cuentas desconocidas', () => {
    const a = testAccount();
    expect(code(() => computeAccountBalances([a, a], [], { asOf: '2026-10-07' }))).toBe(
      'INVALID_ACCOUNT',
    );
    expect(
      code(() =>
        computeAccountBalances([a], [testEntry({ accountId: 'x' })], { asOf: '2026-10-07' }),
      ),
    ).toBe('ACCOUNT_MISMATCH');
  });
});

describe('propiedad: saldo = inicial + entradas − salidas', () => {
  it('se cumple para cualquier combinación de movimientos y fechas', () => {
    const movement = fc.record({
      amount: positiveAmount,
      inflow: fc.boolean(),
      date: localDate,
      status: fc.constantFrom('posted', 'pending', 'void'),
    });
    fc.assert(
      fc.property(
        positiveAmount,
        fc.array(movement, { maxLength: 40 }),
        fc.boolean(),
        (opening, movements, liability) => {
          const account = testAccount({
            type: liability ? 'loan' : 'savings',
            openingBalance: opening,
            openingBalanceDate: '1950-01-01',
          });
          const asOf = '2150-01-01';
          const entries = movements.map((m) =>
            testEntry({
              type: m.inflow ? 'income' : 'expense',
              direction: m.inflow ? 'inflow' : 'outflow',
              amount: m.amount,
              transactionDate: m.date,
              status: m.status,
            }),
          );
          const balance = computeAccountBalance(account, entries, { asOf });

          let expected = Money.of(opening, 'COP');
          for (const entry of entries) {
            const inRange = entry.transactionDate >= '1950-01-01' && entry.transactionDate <= asOf;
            if (entry.status === 'void' || !inRange) continue;
            const amount = Money.of(entry.amount, 'COP');
            const increases = liability
              ? entry.direction === 'outflow'
              : entry.direction === 'inflow';
            expected = increases ? expected.plus(amount) : expected.minus(amount);
          }
          expect(balance.current.equals(expected)).toBe(true);
          expect(balance.posted.plus(balance.pending).equals(balance.current)).toBe(true);
          const counted =
            balance.counted.posted + balance.counted.pending + balance.counted.scheduled;
          const excluded = Object.values(balance.excluded).reduce((a, b) => a + b, 0);
          expect(counted + excluded).toBe(entries.length);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('propiedad: la proyección hasta una fecha es el saldo de esa fecha', () => {
  it('projected(asOf=a, hasta=b) = current(asOf=b) para cualquier a ≤ b', () => {
    const movement = fc.record({
      amount: positiveAmount,
      inflow: fc.boolean(),
      date: localDate,
      status: fc.constantFrom('posted', 'pending', 'void'),
    });
    fc.assert(
      fc.property(
        positiveAmount,
        localDate,
        fc.array(movement, { maxLength: 30 }),
        localDate,
        localDate,
        fc.boolean(),
        (opening, openingDate, movements, d1, d2, liability) => {
          const [a, b] = d1 <= d2 ? [d1, d2] : [d2, d1];
          const account = testAccount({
            type: liability ? 'credit_card' : 'checking',
            openingBalance: opening,
            openingBalanceDate: openingDate,
          });
          const entries = movements.map((m) =>
            testEntry({
              type: m.inflow ? 'income' : 'expense',
              direction: m.inflow ? 'inflow' : 'outflow',
              amount: m.amount,
              transactionDate: m.date,
              status: m.status,
            }),
          );
          const early = computeAccountBalance(account, entries, { asOf: a, projectUntil: b });
          const late = computeAccountBalance(account, entries, { asOf: b });
          expect(early.projected.equals(late.current)).toBe(true);
          expect(early.current.plus(early.scheduled).equals(early.projected)).toBe(true);
          const counted = early.counted.posted + early.counted.pending + early.counted.scheduled;
          const excluded = Object.values(early.excluded).reduce((x, y) => x + y, 0);
          expect(counted + excluded).toBe(entries.length);
        },
      ),
      { numRuns: 500 },
    );
  });
});
