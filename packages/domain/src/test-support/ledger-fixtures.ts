/**
 * SOLO PARA PRUEBAS. Constructores de movimientos y cuentas de ejemplo.
 * Esta carpeta se excluye del build y de la cobertura (ver tsconfig.build.json
 * y vitest.config.mts); ningún código de producción puede importarla.
 */
import type { LedgerAccount } from '../ledger/balance.js';
import type { LedgerEntry } from '../ledger/entry.js';

let sequence = 0;

/** Id determinista y legible para pruebas. */
export function testId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function testAccount(overrides: Partial<LedgerAccount> = {}): LedgerAccount {
  return {
    id: 'acc-checking',
    type: 'checking',
    currency: 'COP',
    openingBalance: '0',
    openingBalanceDate: '2026-01-01',
    ...overrides,
  };
}

/** Movimiento en una sola moneda (COP por defecto), asentado. */
export function testEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  const currency = overrides.accountCurrency ?? 'COP';
  const amount = overrides.amount ?? '10000';
  return {
    id: testId('tx'),
    accountId: 'acc-checking',
    accountCurrency: currency,
    type: 'expense',
    direction: 'outflow',
    status: 'posted',
    transactionDate: '2026-10-07',
    postedDate: null,
    amount,
    originalAmount: amount,
    originalCurrency: currency,
    accountFxRate: null,
    baseAmount: amount,
    baseCurrency: currency,
    baseFxRate: null,
    fxSource: null,
    fxConvertedAt: null,
    categoryId: null,
    transferGroupId: null,
    refundOfId: null,
    deletedAt: null,
    ...overrides,
  };
}

/** Compra en USD cargada a una cuenta en COP (moneda base COP). */
export function testUsdPurchase(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return testEntry({
    originalAmount: '59.99',
    originalCurrency: 'USD',
    amount: '242959.5',
    accountFxRate: '4050',
    baseAmount: '242959.5',
    baseFxRate: '4050',
    fxSource: 'test-rate',
    fxConvertedAt: new Date('2026-10-07T15:00:00Z'),
    ...overrides,
  });
}
