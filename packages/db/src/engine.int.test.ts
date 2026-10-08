/**
 * Integración Financial Engine ↔ PostgreSQL.
 *
 * Comprueba que el motor (@cf/domain) y la base aplican las mismas reglas:
 * todo lo que el motor prepara, la base lo acepta; lo que la base rechaza, el
 * motor también; y los cálculos funcionan directamente sobre filas reales.
 */
import {
  type DomainError,
  type LedgerAmounts,
  Money,
  assertValidLedgerEntry,
  computeAccountBalance,
  computeCashFlow,
  createExchangeRate,
  monthRange,
  prepareLedgerAmounts,
} from '@cf/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from './client.js';
import { accounts, exchangeRates, transactions, userSettings, users } from './schema/index.js';
import { createTestDatabase, resetTestDatabase, truncateUserData } from './testing.js';
import { uuidv7 } from './uuid.js';

let handle: DatabaseHandle;

beforeAll(async () => {
  await resetTestDatabase();
  handle = createTestDatabase();
});

afterAll(async () => {
  await handle?.close();
});

beforeEach(async () => {
  await truncateUserData(handle);
});

const convertedAt = new Date('2026-10-07T15:00:00Z');

async function setup(currency = 'COP') {
  const [user] = await handle.db
    .insert(users)
    .values({
      email: `motor${uuidv7()}@test.co`,
      passwordHash: 'hash-no-real',
      displayName: 'Motor',
    })
    .returning();
  if (!user) throw new Error('no se creó el usuario');
  await handle.db.insert(userSettings).values({ userId: user.id });
  const [account] = await handle.db
    .insert(accounts)
    .values({
      userId: user.id,
      name: 'Cuenta',
      type: 'checking',
      currency,
      openingBalance: '1000000',
      openingBalanceDate: '2026-10-01',
    })
    .returning();
  if (!account) throw new Error('no se creó la cuenta');
  return { user, account };
}

async function insertRate(base: string, quote: string, rate: string, source: string) {
  const [row] = await handle.db
    .insert(exchangeRates)
    .values({
      baseCurrency: base,
      quoteCurrency: quote,
      rate,
      rateDate: '2026-10-07',
      source,
      fetchedAt: convertedAt,
    })
    .returning();
  if (!row) throw new Error('no se creó la tasa');
  return createExchangeRate({ ...row, id: row.id });
}

function row(
  userId: string,
  accountId: string,
  amounts: LedgerAmounts,
  overrides: Partial<typeof transactions.$inferInsert> = {},
): typeof transactions.$inferInsert {
  return {
    userId,
    accountId,
    type: 'expense',
    direction: 'outflow',
    transactionDate: '2026-10-07',
    description: 'Movimiento de prueba',
    ...amounts,
    ...overrides,
  };
}

describe('lo que prepara el motor, la base lo acepta', () => {
  it('en todas las combinaciones de monedas y fuentes de tasa', async () => {
    const cop = await setup('COP');
    const usd = await setup('USD');
    const trm = await insertRate('USD', 'COP', '4050', 'banrep-trm');
    const eurUsd = await insertRate('EUR', 'USD', '1.08', 'ecb');

    const cases: [string, string, LedgerAmounts][] = [
      [
        cop.user.id,
        cop.account.id,
        prepareLedgerAmounts({
          original: Money.of('25000', 'COP'),
          accountCurrency: 'COP',
          baseCurrency: 'COP',
          convertedAt,
        }),
      ],
      [
        cop.user.id,
        cop.account.id,
        prepareLedgerAmounts({
          original: Money.of('59.99', 'USD'),
          accountCurrency: 'COP',
          baseCurrency: 'COP',
          accountConversion: { kind: 'rate', rate: trm },
          convertedAt,
        }),
      ],
      [
        cop.user.id,
        cop.account.id,
        prepareLedgerAmounts({
          original: Money.of('59.99', 'USD'),
          accountCurrency: 'COP',
          baseCurrency: 'COP',
          accountConversion: { kind: 'settled', amount: '243500', source: 'statement' },
          convertedAt,
        }),
      ],
      [
        usd.user.id,
        usd.account.id,
        prepareLedgerAmounts({
          original: Money.of('100', 'USD'),
          accountCurrency: 'USD',
          baseCurrency: 'COP',
          baseRate: trm,
          convertedAt,
        }),
      ],
      [
        usd.user.id,
        usd.account.id,
        prepareLedgerAmounts({
          original: Money.of('50', 'EUR'),
          accountCurrency: 'USD',
          baseCurrency: 'COP',
          accountConversion: { kind: 'rate', rate: eurUsd },
          baseRate: trm,
          convertedAt,
        }),
      ],
    ];

    for (const [userId, accountId, amounts] of cases) {
      const [inserted] = await handle.db
        .insert(transactions)
        .values(row(userId, accountId, amounts))
        .returning();
      expect(inserted).toBeDefined();
      // La fila leída de la base vuelve a pasar la validación del motor.
      expect(() => assertValidLedgerEntry(inserted!)).not.toThrow();
      expect(inserted?.originalAmount).toBe(amounts.originalAmount);
      expect(inserted?.amount).toBe(amounts.amount);
    }
    const [usdRow] = await handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.fxRateId, trm.id ?? ''));
    expect(usdRow?.accountFxRate).toBe('4050.0000000000');
  });
});

describe('lo que la base rechaza, el motor también', () => {
  it.each<[string, Partial<typeof transactions.$inferInsert>, string]>([
    ['gasto como entrada', { direction: 'inflow' }, 'direction_matches_type'],
    ['transferencia sin grupo', { type: 'transfer' }, 'transfer_group'],
    ['enlace de reembolso en un gasto', { refundOfId: uuidv7() }, 'refund_link'],
    ['asiento anterior al movimiento', { postedDate: '2026-10-06' }, 'posted_after_transaction'],
  ])('%s', async (_name, overrides, rule) => {
    const { user, account } = await setup();
    const amounts = prepareLedgerAmounts({
      original: Money.of('1000', 'COP'),
      accountCurrency: 'COP',
      baseCurrency: 'COP',
      convertedAt,
    });
    const values = row(user.id, account.id, amounts, overrides);

    await expect(handle.db.insert(transactions).values(values)).rejects.toThrow();
    let engineRule: unknown = 'aceptado';
    try {
      assertValidLedgerEntry({
        id: 'candidato',
        accountId: account.id,
        accountCurrency: 'COP',
        type: values.type,
        direction: values.direction,
        status: 'posted',
        transactionDate: values.transactionDate,
        postedDate: values.postedDate ?? null,
        amount: amounts.amount,
        originalAmount: amounts.originalAmount,
        originalCurrency: amounts.originalCurrency,
        accountFxRate: null,
        baseAmount: amounts.baseAmount,
        baseCurrency: amounts.baseCurrency,
        baseFxRate: null,
        fxSource: null,
        fxConvertedAt: null,
        categoryId: null,
        transferGroupId: values.transferGroupId ?? null,
        refundOfId: values.refundOfId ?? null,
        deletedAt: null,
      });
    } catch (error) {
      engineRule = (error as DomainError).details.rule;
    }
    expect(engineRule).toBe(rule);
  });
});

describe('cálculos sobre filas reales', () => {
  it('saldo y flujo de caja directamente desde la base', async () => {
    const { user, account } = await setup();
    const savings = (
      await handle.db
        .insert(accounts)
        .values({
          userId: user.id,
          name: 'Ahorros',
          type: 'savings',
          currency: 'COP',
          openingBalanceDate: '2026-10-01',
        })
        .returning()
    )[0]!;
    const cop = (amount: string) =>
      prepareLedgerAmounts({
        original: Money.of(amount, 'COP'),
        accountCurrency: 'COP',
        baseCurrency: 'COP',
        convertedAt,
      });
    const group = uuidv7();

    await handle.db.insert(transactions).values([
      row(user.id, account.id, cop('2900000'), {
        type: 'income',
        direction: 'inflow',
        transactionDate: '2026-10-01',
      }),
      row(user.id, account.id, cop('800000'), { transactionDate: '2026-10-02' }),
      row(user.id, account.id, cop('50000'), { status: 'pending' }),
      row(user.id, account.id, cop('99999'), { status: 'void' }),
      row(user.id, account.id, cop('500000'), {
        type: 'transfer',
        direction: 'outflow',
        transferGroupId: group,
      }),
      row(user.id, savings.id, cop('500000'), {
        type: 'transfer',
        direction: 'inflow',
        transferGroupId: group,
      }),
      row(user.id, account.id, cop('10000'), { transactionDate: '2026-11-01' }),
    ]);

    const rows = await handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, account.id));
    const balance = computeAccountBalance(account, rows, { asOf: '2026-10-31' });
    expect(balance.posted.toAmountString()).toBe('2600000.0000');
    expect(balance.pending.toAmountString()).toBe('-50000.0000');
    expect(balance.current.toAmountString()).toBe('2550000.0000');
    expect(balance.excluded).toMatchObject({ void: 1, afterAsOf: 1 });

    const allRows = await handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, user.id));
    const flow = computeCashFlow(allRows, {
      period: monthRange('2026-10'),
      baseCurrency: 'COP',
      includePending: true,
    });
    expect(flow.income.toAmountString()).toBe('2900000.0000');
    expect(flow.netExpenses.toAmountString()).toBe('850000.0000');
    expect(flow.excluded).toMatchObject({ transfer: 2, void: 1, outsidePeriod: 1 });
  });
});
