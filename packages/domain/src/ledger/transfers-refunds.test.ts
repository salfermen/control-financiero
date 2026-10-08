import { describe, expect, it } from 'vitest';
import type { DomainError } from '../errors.js';
import { testEntry, testUsdPurchase } from '../test-support/ledger-fixtures.js';
import type { LedgerEntry } from './entry.js';
import { assertValidRefund } from './refunds.js';
import { assertValidTransferGroup } from './transfers.js';

const rule = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    const e = error as DomainError;
    return e.details.rule === undefined ? e.code : `${e.code}:${String(e.details.rule)}`;
  }
  return 'valid';
};

describe('transferencias entre cuentas propias', () => {
  const out = testEntry({
    id: 'leg-out',
    type: 'transfer',
    direction: 'outflow',
    amount: '500000',
    transferGroupId: 'g-1',
  });
  const inn = testEntry({
    id: 'leg-in',
    accountId: 'acc-savings',
    type: 'transfer',
    direction: 'inflow',
    amount: '500000',
    transferGroupId: 'g-1',
  });

  it('valida las dos patas y resume el movimiento', () => {
    const summary = assertValidTransferGroup([inn, out]);
    expect(summary).toMatchObject({
      transferGroupId: 'g-1',
      fromAccountId: 'acc-checking',
      toAccountId: 'acc-savings',
      impliedRate: null,
    });
    expect(summary.sent.equals(summary.received)).toBe(true);
  });

  it('acepta transferencias entre monedas e informa la tasa implícita', () => {
    const usdLeg = testEntry({
      accountId: 'acc-usd',
      accountCurrency: 'USD',
      type: 'transfer',
      direction: 'inflow',
      amount: '100',
      originalAmount: '100',
      originalCurrency: 'USD',
      baseAmount: '405000',
      baseCurrency: 'COP',
      baseFxRate: '4050',
      fxSource: 'test-rate',
      fxConvertedAt: new Date(),
      transferGroupId: 'g-1',
    });
    const summary = assertValidTransferGroup([
      { ...out, amount: '405000', originalAmount: '405000', baseAmount: '405000' },
      usdLeg,
    ]);
    expect(summary.impliedRate).toBe('0.0002469136');
  });

  it('acepta el pago de una tarjeta desde otra cuenta propia', () => {
    const pay = (direction: 'inflow' | 'outflow', accountId: string): LedgerEntry =>
      testEntry({
        accountId,
        type: 'payment',
        direction,
        amount: '300000',
        transferGroupId: 'g-2',
      });
    expect(
      rule(() =>
        assertValidTransferGroup([pay('outflow', 'acc-checking'), pay('inflow', 'acc-card')]),
      ),
    ).toBe('valid');
  });

  it.each<[string, () => readonly LedgerEntry[], string]>([
    ['una sola pata', () => [out], 'INVALID_TRANSFER:leg_count'],
    ['tres patas', () => [out, inn, inn], 'INVALID_TRANSFER:leg_count'],
    ['grupos distintos', () => [out, { ...inn, transferGroupId: 'g-2' }], 'INVALID_TRANSFER:group'],
    ['tipos distintos', () => [out, { ...inn, type: 'payment' }], 'INVALID_TRANSFER:type'],
    [
      'tipo no permitido',
      () => [
        { ...out, type: 'investment' },
        { ...inn, type: 'investment' },
      ],
      'INVALID_TRANSFER:type',
    ],
    ['estados distintos', () => [out, { ...inn, status: 'pending' }], 'INVALID_TRANSFER:status'],
    ['dos salidas', () => [out, { ...inn, direction: 'outflow' }], 'INVALID_TRANSFER:directions'],
    [
      'misma cuenta',
      () => [out, { ...inn, accountId: 'acc-checking' }],
      'INVALID_TRANSFER:same_account',
    ],
    [
      'llega antes de salir',
      () => [out, { ...inn, transactionDate: '2026-10-06' }],
      'INVALID_TRANSFER:inflow_before_outflow',
    ],
    [
      'montos distintos en la misma moneda',
      () => [out, { ...inn, amount: '499999', originalAmount: '499999', baseAmount: '499999' }],
      'INVALID_TRANSFER:amount_mismatch',
    ],
    [
      'pata inválida',
      () => [out, { ...inn, transferGroupId: null }],
      'INVALID_LEDGER_ENTRY:transfer_group',
    ],
  ])('rechaza %s', (_name, legs, expected) => {
    expect(rule(() => assertValidTransferGroup(legs()))).toBe(expected);
  });

  it('acepta que el dinero llegue días después', () => {
    expect(
      rule(() => assertValidTransferGroup([out, { ...inn, transactionDate: '2026-10-09' }])),
    ).toBe('valid');
  });
});

describe('reembolsos', () => {
  const original = testUsdPurchase({ id: 'tx-game', transactionDate: '2026-10-01' });
  const refund = (amount: string, extra: Partial<LedgerEntry> = {}) =>
    testUsdPurchase({
      type: 'refund',
      direction: 'inflow',
      refundOfId: 'tx-game',
      originalAmount: amount,
      transactionDate: '2026-10-05',
      ...extra,
    });

  it('acepta un reembolso parcial y calcula lo que queda', () => {
    const check = assertValidRefund(refund('20'), original);
    expect(check.refundedTotal.toAmountString()).toBe('20.0000');
    expect(check.remaining.toAmountString()).toBe('39.9900');
    expect(check.remaining.currency).toBe('USD');
  });

  it('acumula reembolsos previos e ignora anulados, borrados y el propio reembolso', () => {
    const current = refund('20', { id: 'r-3' });
    const check = assertValidRefund(current, original, [
      refund('30', { id: 'r-1' }),
      refund('50', { id: 'r-2', status: 'void' }),
      refund('50', { id: 'r-4', deletedAt: new Date() }),
      current,
    ]);
    expect(check.refundedTotal.toAmountString()).toBe('50.0000');
    expect(check.remaining.toAmountString()).toBe('9.9900');
  });

  it('acepta el reembolso total exacto', () => {
    expect(assertValidRefund(refund('59.99'), original).remaining.isZero()).toBe(true);
  });

  it.each<[string, () => unknown, string]>([
    [
      'superar el original',
      () => assertValidRefund(refund('60'), original),
      'INVALID_REFUND:exceeds_original',
    ],
    [
      'superar con los previos',
      () => assertValidRefund(refund('30'), original, [refund('30', { id: 'r-1' })]),
      'INVALID_REFUND:exceeds_original',
    ],
    [
      'otro original',
      () => assertValidRefund(refund('1', { refundOfId: 'otro' }), original),
      'INVALID_REFUND:link',
    ],
    [
      'no ser reembolso',
      () => assertValidRefund(testUsdPurchase({ id: 'x' }), original),
      'INVALID_REFUND:link',
    ],
    [
      'reembolsar un ingreso',
      () => assertValidRefund(refund('1'), { ...original, type: 'income', direction: 'inflow' }),
      'INVALID_REFUND:original_type',
    ],
    [
      'original anulado',
      () => assertValidRefund(refund('1'), { ...original, status: 'void' }),
      'INVALID_REFUND:original_inactive',
    ],
    [
      'ser anterior al gasto',
      () => assertValidRefund(refund('1', { transactionDate: '2026-09-30' }), original),
      'INVALID_REFUND:before_original',
    ],
    [
      'otra moneda original',
      () =>
        assertValidRefund(
          testEntry({
            type: 'refund',
            direction: 'inflow',
            refundOfId: 'tx-game',
            transactionDate: '2026-10-05',
          }),
          original,
        ),
      'INVALID_REFUND:currency',
    ],
    [
      'un previo de otro gasto',
      () =>
        assertValidRefund(refund('1'), original, [refund('1', { id: 'r-9', refundOfId: 'otro' })]),
      'INVALID_REFUND:previous_link',
    ],
    [
      'un previo en otra moneda',
      () =>
        assertValidRefund(refund('1'), original, [
          testEntry({ id: 'r-8', type: 'refund', direction: 'inflow', refundOfId: 'tx-game' }),
        ]),
      'INVALID_REFUND:currency',
    ],
  ])('rechaza %s', (_name, run, expected) => {
    expect(rule(run)).toBe(expected);
  });

  it('acepta reembolsar una comisión', () => {
    const fee = testEntry({ id: 'fee-1', type: 'fee', amount: '15000' });
    const back = testEntry({
      type: 'refund',
      direction: 'inflow',
      amount: '15000',
      refundOfId: 'fee-1',
    });
    expect(assertValidRefund(back, fee).remaining.isZero()).toBe(true);
  });
});
