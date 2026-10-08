import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { createExchangeRate } from '../fx/exchange-rate.js';
import type { RateResolution } from '../fx/rate-resolution.js';
import { testAccount, testEntry } from '../test-support/ledger-fixtures.js';
import { computeAccountBalance, type LedgerAccount } from './balance.js';
import type { LedgerEntry } from './entry.js';
import { computeFinancialPosition, positionGroup, type PositionAccount } from './position.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as DomainError).code;
  }
  return 'NO_ERROR';
};

const ASOF = '2026-10-07';
const usdCop = createExchangeRate({
  baseCurrency: 'USD',
  quoteCurrency: 'COP',
  rate: '3216.01',
  rateDate: '2026-10-07',
  source: 'superfinanciera-trm',
});
const current: RateResolution = { status: 'current', rate: usdCop };

function position(
  account: LedgerAccount,
  entries: readonly LedgerEntry[] = [],
  projectUntil?: string,
): PositionAccount {
  return {
    type: account.type,
    balance: computeAccountBalance(account, entries, {
      asOf: ASOF,
      ...(projectUntil ? { projectUntil } : {}),
    }),
  };
}

const options = {
  baseCurrency: 'COP',
  asOf: ASOF,
  projectUntil: null,
  rates: new Map<string, RateResolution>([['USD', current]]),
  maxRateStalenessDays: 5,
};

describe('posición financiera consolidada', () => {
  const savings = testAccount({
    id: 'acc-savings',
    type: 'savings',
    openingBalance: '2000000',
    openingBalanceDate: '2026-10-01',
  });
  const card = testAccount({
    id: 'acc-card',
    type: 'credit_card',
    openingBalance: '450000',
    openingBalanceDate: '2026-10-01',
  });
  const broker = testAccount({
    id: 'acc-broker',
    type: 'investment',
    openingBalance: '3000000',
    openingBalanceDate: '2026-10-01',
  });
  const salary = testAccount({
    id: 'acc-salary',
    type: 'savings',
    openingBalance: '1500000',
    openingBalanceDate: '2026-10-30',
  });

  it('separa disponible, inversiones y deudas; el cupo de la tarjeta no es disponible', () => {
    const result = computeFinancialPosition(
      [
        position(savings, [
          testEntry({ accountId: 'acc-savings', amount: '100000', transactionDate: '2026-10-20' }),
        ]),
        position(card),
        position(broker),
        position(salary, [
          testEntry({ accountId: 'acc-salary', amount: '1429633', transactionDate: '2026-10-31' }),
        ]),
      ],
      options,
    );
    expect(result.liquid.today.toAmountString()).toBe('2000000.0000');
    expect(result.liquid.projected.toAmountString()).toBe('1970367.0000');
    expect(result.investments.today.toAmountString()).toBe('3000000.0000');
    expect(result.liabilities.today.toAmountString()).toBe('450000.0000');
    expect(result.assets.today.toAmountString()).toBe('5000000.0000');
    expect(result.netWorth.today.toAmountString()).toBe('4550000.0000');
    expect(result.netWorth.projected.toAmountString()).toBe('4520367.0000');
    expect(result.notStarted).toEqual(['acc-salary']);
    expect(result.unconverted).toEqual([]);
    expect(result.estimated).toBe(false);
    expect(result.lines.map((l) => [l.accountId, l.group])).toEqual([
      ['acc-savings', 'liquid'],
      ['acc-card', 'liability'],
      ['acc-broker', 'investment'],
      ['acc-salary', 'liquid'],
    ]);
  });

  it('convierte cuentas en otra moneda con la tasa de hoy y conserva la tasa usada', () => {
    const wallet = testAccount({
      id: 'acc-usd',
      type: 'digital_wallet',
      currency: 'USD',
      openingBalance: '100.50',
      openingBalanceDate: '2026-10-01',
    });
    const result = computeFinancialPosition([position(wallet)], options);
    expect(result.liquid.today.toAmountString()).toBe('323209.0050');
    const [line] = result.lines;
    expect(line?.conversion).toMatchObject({ appliedRate: '3216.0100000000', stale: false });
    expect(line?.currency).toBe('USD');
  });

  it('con una tasa vencida aceptable convierte pero marca el total como estimado', () => {
    const wallet = testAccount({
      id: 'acc-usd',
      type: 'digital_wallet',
      currency: 'USD',
      openingBalance: '10',
      openingBalanceDate: '2026-10-01',
    });
    const result = computeFinancialPosition([position(wallet)], {
      ...options,
      rates: new Map([['USD', { status: 'stale', rate: usdCop, daysOutdated: 3 }]]),
    });
    expect(result.estimated).toBe(true);
    expect(result.lines[0]?.conversion).toMatchObject({ stale: true, daysOutdated: 3 });
  });

  it('sin tasa, o con una demasiado vieja, la cuenta no se suma y se informa', () => {
    const usd = testAccount({ id: 'acc-usd', currency: 'USD', openingBalance: '10' });
    const eur = testAccount({ id: 'acc-eur', currency: 'EUR', openingBalance: '10' });
    const result = computeFinancialPosition([position(usd), position(eur), position(savings)], {
      ...options,
      rates: new Map([['USD', { status: 'stale', rate: usdCop, daysOutdated: 9 }]]),
    });
    expect(result.unconverted).toEqual([
      { accountId: 'acc-usd', currency: 'USD', reason: 'stale_rate' },
      { accountId: 'acc-eur', currency: 'EUR', reason: 'missing_rate' },
    ]);
    expect(result.liquid.today.toAmountString()).toBe('2000000.0000');
    expect(result.lines).toHaveLength(1);
  });

  it('sin cuentas, todo es cero', () => {
    const result = computeFinancialPosition([], options);
    expect(result.netWorth.today.isZero()).toBe(true);
    expect(result.asOf).toBe(ASOF);
  });

  it('respeta el límite de la proyección', () => {
    const result = computeFinancialPosition([position(salary, [], '2026-10-29')], {
      ...options,
      projectUntil: '2026-10-29',
    });
    expect(result.liquid.projected.isZero()).toBe(true);
    expect(result.projectUntil).toBe('2026-10-29');
  });

  it('valida fechas, ids, tipos, tasas y parámetros', () => {
    expect(
      code(() => computeFinancialPosition([position(savings)], { ...options, asOf: '2026-10-08' })),
    ).toBe('INVALID_DATE_RANGE');
    expect(
      code(() =>
        computeFinancialPosition([position(savings, [], '2026-10-31')], {
          ...options,
        }),
      ),
    ).toBe('INVALID_DATE_RANGE');
    expect(
      code(() => computeFinancialPosition([position(savings), position(savings)], options)),
    ).toBe('INVALID_ACCOUNT');
    expect(
      code(() =>
        computeFinancialPosition([{ type: 'loan', balance: position(savings).balance }], options),
      ),
    ).toBe('INVALID_ACCOUNT');
    const eurUsd = createExchangeRate({
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      rate: '1.08',
      rateDate: ASOF,
      source: 'manual',
    });
    const eur = testAccount({ id: 'acc-eur', currency: 'EUR', openingBalance: '10' });
    expect(
      code(() =>
        computeFinancialPosition([position(eur)], {
          ...options,
          rates: new Map([['EUR', { status: 'current', rate: eurUsd }]]),
        }),
      ),
    ).toBe('RATE_PAIR_MISMATCH');
    expect(code(() => computeFinancialPosition([], { ...options, maxRateStalenessDays: -1 }))).toBe(
      'INVALID_NUMBER',
    );
    expect(code(() => computeFinancialPosition([], { ...options, baseCurrency: 'XYZ' }))).toBe(
      'UNSUPPORTED_CURRENCY',
    );
    expect(code(() => computeFinancialPosition([], { ...options, projectUntil: 'x' }))).toBe(
      'INVALID_DATE',
    );
  });

  it('clasifica cada tipo de cuenta', () => {
    expect(positionGroup('checking')).toBe('liquid');
    expect(positionGroup('cash')).toBe('liquid');
    expect(positionGroup('investment')).toBe('investment');
    expect(positionGroup('loan')).toBe('liability');
  });
});
