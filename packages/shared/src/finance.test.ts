import { describe, expect, it } from 'vitest';
import {
  cashFlowQuerySchema,
  createAccountRequestSchema,
  createTransactionRequestSchema,
  exchangeRateHistoryQuerySchema,
  localDateSchema,
  positiveAmountSchema,
  rateSchema,
  signedAmountSchema,
  transactionListQuerySchema,
  updateAccountRequestSchema,
  updateTransactionRequestSchema,
} from './index.js';

const ACCOUNT = '01920000-0000-7000-8000-000000000001';
const OTHER = '01920000-0000-7000-8000-000000000002';

describe('montos y fechas', () => {
  it.each(['1', '25000', '59.99', '0.0001', '9999999999999999.9999'])('acepta %s', (value) => {
    expect(positiveAmountSchema.parse(value)).toBe(value);
  });

  it.each(['0', '0.0000', '-1', '1.23456', '1,000', '25.000,50', '1e3', '', 'abc', 59.99])(
    'rechaza el monto %j',
    (value) => {
      expect(positiveAmountSchema.safeParse(value).success).toBe(false);
    },
  );

  it('admite saldos iniciales negativos y tasas con 10 decimales', () => {
    expect(signedAmountSchema.parse('-20000')).toBe('-20000');
    expect(rateSchema.parse('4050.1234567891')).toBe('4050.1234567891');
    expect(rateSchema.safeParse('0').success).toBe(false);
    expect(rateSchema.safeParse('1.12345678901').success).toBe(false);
  });

  it('valida fechas reales', () => {
    expect(localDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(localDateSchema.safeParse('2026-02-29').success).toBe(false);
  });
});

describe('cuentas', () => {
  it('aplica valores por defecto y limpia textos vacíos', () => {
    const parsed = createAccountRequestSchema.parse({
      name: '  Bancolombia ahorros ',
      type: 'savings',
      currency: 'COP',
      institutionName: '',
      openingBalanceDate: '2026-10-01',
    });
    expect(parsed).toEqual({
      name: 'Bancolombia ahorros',
      type: 'savings',
      currency: 'COP',
      institutionName: undefined,
      openingBalance: '0',
      openingBalanceDate: '2026-10-01',
      includeInNetWorth: true,
      notes: undefined,
    });
  });

  it('rechaza campos desconocidos, tipos inválidos y actualizaciones vacías', () => {
    const base = { name: 'x', type: 'savings', currency: 'COP', openingBalanceDate: '2026-10-01' };
    expect(createAccountRequestSchema.safeParse({ ...base, balance: '5' }).success).toBe(false);
    expect(createAccountRequestSchema.safeParse({ ...base, type: 'crypto' }).success).toBe(false);
    expect(createAccountRequestSchema.safeParse({ ...base, currency: 'XYZ' }).success).toBe(false);
    expect(updateAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAccountRequestSchema.parse({ institutionName: '' })).toEqual({
      institutionName: null,
    });
  });
});

describe('movimientos', () => {
  it('distingue el tipo de movimiento por `kind`', () => {
    const expense = createTransactionRequestSchema.parse({
      kind: 'expense',
      accountId: ACCOUNT,
      amount: '59.99',
      currency: 'USD',
      fx: { accountAmount: '243500' },
      transactionDate: '2026-10-07',
      description: 'Juego en Steam',
    });
    expect(expense).toMatchObject({ kind: 'expense', status: 'posted' });

    const transfer = createTransactionRequestSchema.parse({
      kind: 'transfer',
      fromAccountId: ACCOUNT,
      toAccountId: OTHER,
      amount: '500000',
      transactionDate: '2026-10-07',
    });
    expect(transfer.kind).toBe('transfer');
  });

  it('rechaza combinaciones inválidas', () => {
    const invalid = [
      {
        kind: 'gift',
        accountId: ACCOUNT,
        amount: '1',
        transactionDate: '2026-10-07',
        description: 'x',
      },
      {
        kind: 'expense',
        accountId: ACCOUNT,
        amount: '0',
        transactionDate: '2026-10-07',
        description: 'x',
      },
      {
        kind: 'expense',
        accountId: ACCOUNT,
        amount: '1',
        transactionDate: '2026-10-07',
        description: '  ',
      },
      {
        kind: 'expense',
        accountId: ACCOUNT,
        amount: '1',
        transactionDate: '2026-10-07',
        description: 'x',
        fx: { accountAmount: '1', rate: '1' },
      },
      {
        kind: 'transfer',
        fromAccountId: ACCOUNT,
        toAccountId: ACCOUNT,
        amount: '1',
        transactionDate: '2026-10-07',
      },
      {
        kind: 'expense',
        accountId: ACCOUNT,
        amount: '1',
        transactionDate: '2026-10-07',
        description: 'x',
        status: 'void',
      },
    ];
    for (const payload of invalid) {
      expect(createTransactionRequestSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('valida filtros y paginación', () => {
    expect(transactionListQuerySchema.parse({ limit: '20' })).toEqual({ limit: 20 });
    expect(transactionListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(transactionListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(
      transactionListQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success,
    ).toBe(false);
    expect(transactionListQuerySchema.safeParse({ cursor: "x' OR 1=1" }).success).toBe(false);
    expect(updateTransactionRequestSchema.safeParse({}).success).toBe(false);
    expect(updateTransactionRequestSchema.parse({ categoryId: null })).toEqual({
      categoryId: null,
    });
  });
});

describe('tasas y flujo', () => {
  it('usa USD/COP por defecto y valida el rango', () => {
    expect(
      exchangeRateHistoryQuerySchema.parse({ from: '2026-10-01', to: '2026-10-07' }),
    ).toMatchObject({ base: 'USD', quote: 'COP' });
    expect(
      exchangeRateHistoryQuerySchema.safeParse({ from: '2026-10-08', to: '2026-10-07' }).success,
    ).toBe(false);
  });

  it('interpreta includePending como booleano', () => {
    expect(cashFlowQuerySchema.parse({ month: '2026-10' })).toEqual({
      month: '2026-10',
      includePending: true,
    });
    expect(cashFlowQuerySchema.parse({ includePending: 'false' }).includePending).toBe(false);
    expect(cashFlowQuerySchema.safeParse({ month: '2026-13' }).success).toBe(false);
  });
});
