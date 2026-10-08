import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { testEntry, testUsdPurchase } from '../test-support/ledger-fixtures.js';
import { ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES, accountNature } from './constants.js';
import { type LedgerEntry, assertValidLedgerEntry, balanceEffect, isActiveEntry } from './entry.js';

const violation = (overrides: Partial<LedgerEntry>) => {
  try {
    assertValidLedgerEntry(testEntry(overrides));
  } catch (error) {
    const e = error as DomainError;
    return e.code === 'INVALID_LEDGER_ENTRY' ? String(e.details.rule) : e.code;
  }
  return 'valid';
};

describe('reglas del libro (espejo de los CHECK de PostgreSQL)', () => {
  it('acepta movimientos válidos de cada tipo', () => {
    expect(violation({})).toBe('valid');
    expect(violation({ type: 'income', direction: 'inflow' })).toBe('valid');
    expect(violation({ type: 'refund', direction: 'inflow', refundOfId: 'tx-1' })).toBe('valid');
    expect(violation({ type: 'fee', direction: 'outflow' })).toBe('valid');
    expect(violation({ type: 'transfer', direction: 'inflow', transferGroupId: 'g-1' })).toBe(
      'valid',
    );
    expect(violation({ type: 'payment', direction: 'inflow' })).toBe('valid');
    expect(violation({ type: 'payment', direction: 'outflow', transferGroupId: 'g-2' })).toBe(
      'valid',
    );
    expect(violation({ type: 'investment', direction: 'outflow' })).toBe('valid');
    expect(violation({ postedDate: '2026-10-09' })).toBe('valid');
    expect(() => assertValidLedgerEntry(testUsdPurchase())).not.toThrow();
  });

  it('exige montos positivos y bien formados', () => {
    expect(violation({ amount: '0', originalAmount: '0', baseAmount: '0' })).toBe(
      'amount_positive',
    );
    expect(violation({ amount: '-5', originalAmount: '-5', baseAmount: '-5' })).toBe(
      'amount_positive',
    );
    expect(violation({ amount: '1.23456' })).toBe('TOO_MANY_DECIMALS');
    expect(violation({ accountCurrency: 'XYZ' })).toBe('UNSUPPORTED_CURRENCY');
  });

  it('valida tipo, dirección, estado y fechas', () => {
    expect(violation({ type: 'gift' as never })).toBe('type');
    expect(violation({ direction: 'sideways' as never })).toBe('direction');
    expect(violation({ status: 'maybe' as never })).toBe('status');
    expect(violation({ transactionDate: '2026-02-30' })).toBe('INVALID_DATE');
    expect(violation({ postedDate: '2026-10-06' })).toBe('posted_after_transaction');
    expect(violation({ postedDate: '07-10-2026' })).toBe('INVALID_DATE');
  });

  it('exige la dirección que corresponde al tipo', () => {
    expect(violation({ type: 'expense', direction: 'inflow' })).toBe('direction_matches_type');
    expect(violation({ type: 'income', direction: 'outflow' })).toBe('direction_matches_type');
    expect(violation({ type: 'refund', direction: 'outflow' })).toBe('direction_matches_type');
    expect(violation({ type: 'fee', direction: 'inflow' })).toBe('direction_matches_type');
  });

  it('aplica las reglas de transferencias y reembolsos', () => {
    expect(violation({ type: 'transfer', direction: 'outflow' })).toBe('transfer_group');
    expect(violation({ transferGroupId: 'g-1' })).toBe('transfer_group');
    expect(
      violation({ type: 'transfer', direction: 'outflow', transferGroupId: 'g', categoryId: 'c' }),
    ).toBe('transfer_without_category');
    expect(violation({ refundOfId: 'tx-1' })).toBe('refund_link');
  });

  it('exige coherencia en las conversiones', () => {
    // Misma moneda: sin tasa y montos iguales (aunque se escriban distinto).
    expect(violation({ amount: '10000.0000', originalAmount: '10000' })).toBe('valid');
    expect(violation({ accountFxRate: '1' })).toBe('account_conversion');
    expect(violation({ amount: '10001', originalAmount: '10000', baseAmount: '10000' })).toBe(
      'account_conversion',
    );
    expect(violation({ baseFxRate: '1' })).toBe('base_conversion');
    expect(violation({ baseAmount: '9999' })).toBe('base_conversion');
    // Moneda distinta: tasa obligatoria, positiva y trazable.
    const usd = testUsdPurchase();
    const check = (overrides: Partial<LedgerEntry>) => {
      try {
        assertValidLedgerEntry({ ...usd, ...overrides });
      } catch (error) {
        const e = error as DomainError;
        return e.code === 'INVALID_LEDGER_ENTRY' ? String(e.details.rule) : e.code;
      }
      return 'valid';
    };
    expect(check({ accountFxRate: null })).toBe('account_conversion');
    expect(check({ accountFxRate: '0' })).toBe('account_conversion');
    expect(check({ accountFxRate: 'abc' })).toBe('INVALID_RATE');
    expect(check({ baseFxRate: null })).toBe('base_conversion');
    expect(check({ fxSource: null })).toBe('conversion_traceable');
    expect(check({ fxConvertedAt: null })).toBe('conversion_traceable');
  });

  it('identifica movimientos activos', () => {
    expect(isActiveEntry(testEntry())).toBe(true);
    expect(isActiveEntry(testEntry({ status: 'pending' }))).toBe(true);
    expect(isActiveEntry(testEntry({ status: 'void' }))).toBe(false);
    expect(isActiveEntry(testEntry({ deletedAt: new Date() }))).toBe(false);
  });
});

describe('efecto en el saldo', () => {
  it('en activos la entrada suma y la salida resta', () => {
    expect(
      balanceEffect(testEntry({ type: 'income', direction: 'inflow' }), 'asset').toAmountString(),
    ).toBe('10000.0000');
    expect(balanceEffect(testEntry(), 'asset').toAmountString()).toBe('-10000.0000');
  });

  it('en pasivos la compra aumenta la deuda y el abono la reduce', () => {
    expect(balanceEffect(testEntry(), 'liability').toAmountString()).toBe('10000.0000');
    expect(
      balanceEffect(
        testEntry({ type: 'payment', direction: 'inflow' }),
        'liability',
      ).toAmountString(),
    ).toBe('-10000.0000');
  });

  it('clasifica la naturaleza de cada tipo de cuenta', () => {
    for (const type of ACCOUNT_TYPES) {
      const expected = (LIABILITY_ACCOUNT_TYPES as readonly string[]).includes(type)
        ? 'liability'
        : 'asset';
      expect(accountNature(type)).toBe(expected);
    }
  });
});
