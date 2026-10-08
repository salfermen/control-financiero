/**
 * Integración F4: cuentas, movimientos, tasas y flujo de caja a través de la
 * API real (Nest + Fastify) contra PostgreSQL. Las tasas se insertan
 * directamente en la tabla, como lo haría el worker: son datos de prueba.
 */
import { auditLogs, exchangeRates } from '@cf/db';
import {
  type AccountDto,
  type TransactionDto,
  accountDtoSchema,
  apiErrorBodySchema,
  cashFlowDtoSchema,
  categoryDtoSchema,
  exchangeRateLookupDtoSchema,
  listOf,
  transactionDtoSchema,
  transactionListDtoSchema,
} from '@cf/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cursorCodec } from '../src/transactions/transactions.service.js';
import {
  CSRF,
  type TestContext,
  registerUser,
  resetData,
  setupTestApp,
  teardownTestApp,
} from './helpers.js';

let ctx: TestContext;
let cookie: string;
let userId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await teardownTestApp(ctx);
});
beforeEach(async () => {
  await resetData(ctx);
  await ctx.db.db.delete(exchangeRates);
  ({ cookie, userId } = await registerUser(ctx));
});

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
async function call(method: Method, url: string, payload?: unknown, as = cookie) {
  return ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { cookie: as, ...(method === 'GET' ? {} : CSRF) },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
}

async function createAccount(overrides: Record<string, unknown> = {}): Promise<AccountDto> {
  const response = await call('POST', '/accounts', {
    name: 'Ahorros',
    type: 'savings',
    currency: 'COP',
    openingBalance: '1000000',
    openingBalanceDate: '2026-10-01',
    ...overrides,
  });
  expect(response.statusCode, response.body).toBe(201);
  return accountDtoSchema.parse(response.json());
}

async function createTx(payload: Record<string, unknown>): Promise<TransactionDto[]> {
  const response = await call('POST', '/transactions', payload);
  expect(response.statusCode, response.body).toBe(201);
  return listOf(transactionDtoSchema).parse(response.json()).data;
}

function expectError(
  response: Awaited<ReturnType<typeof call>>,
  status: number,
  code: string,
  path?: string,
) {
  expect(response.statusCode, response.body).toBe(status);
  const body = apiErrorBodySchema.parse(response.json());
  expect(body.error.code).toBe(code);
  if (path) expect(body.error.issues?.map((i) => i.path)).toContain(path);
}

async function balanceOf(id: string): Promise<string> {
  const response = await call('GET', `/accounts/${id}`);
  return accountDtoSchema.parse(response.json()).balance.current.amount;
}

async function categoryId(key: string): Promise<string> {
  const response = await call('GET', '/categories');
  const found = listOf(categoryDtoSchema)
    .parse(response.json())
    .data.find((c) => c.systemKey === key);
  if (!found) throw new Error(`Categoría ${key} no sembrada`);
  return found.id;
}

const expense = (accountId: string, amount: string, extra: Record<string, unknown> = {}) => ({
  kind: 'expense',
  accountId,
  amount,
  transactionDate: '2026-10-05',
  description: 'Mercado',
  ...extra,
});

async function insertTrm(rateDate: string, rate: string, validUntil: string | null = null) {
  await ctx.db.db.insert(exchangeRates).values({
    baseCurrency: 'USD',
    quoteCurrency: 'COP',
    rate,
    rateDate,
    validUntil,
    source: 'test-trm',
    fetchedAt: new Date(`${rateDate}T20:00:00Z`),
  });
}

describe('cuentas', () => {
  it('crea, lista con saldo, edita, cierra y audita', async () => {
    const account = await createAccount({ institutionName: 'Banco de prueba' });
    expect(account).toMatchObject({
      nature: 'asset',
      status: 'active',
      openingBalance: { amount: '1000000.0000', currency: 'COP' },
      balance: { current: { amount: '1000000.0000' }, transactionCount: 0 },
    });

    const list = listOf(accountDtoSchema).parse((await call('GET', '/accounts')).json());
    expect(list.data.map((a) => a.id)).toEqual([account.id]);

    const renamed = await call('PATCH', `/accounts/${account.id}`, {
      name: 'Nómina',
      status: 'closed',
    });
    expect(accountDtoSchema.parse(renamed.json())).toMatchObject({
      name: 'Nómina',
      status: 'closed',
    });

    expectError(
      await call('POST', '/transactions', expense(account.id, '1000')),
      409,
      'ACCOUNT_CLOSED',
      'accountId',
    );

    const events = await ctx.db.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, userId), eq(auditLogs.entityId, account.id)));
    expect(events.map((e) => e.action).sort()).toEqual(['account_created', 'account_updated']);
  });

  it('una tarjeta es un pasivo: su saldo es lo que se debe', async () => {
    const card = await createAccount({
      name: 'Visa',
      type: 'credit_card',
      openingBalance: '300000',
    });
    expect(card.nature).toBe('liability');
    await createTx(expense(card.id, '50000'));
    expect(await balanceOf(card.id)).toBe('350000.0000');
  });

  it('solo elimina cuentas sin movimientos', async () => {
    const empty = await createAccount();
    expect((await call('DELETE', `/accounts/${empty.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/accounts/${empty.id}`)).statusCode).toBe(404);

    const used = await createAccount();
    await createTx(expense(used.id, '1000'));
    expectError(await call('DELETE', `/accounts/${used.id}`), 409, 'ACCOUNT_HAS_TRANSACTIONS');
  });

  it('no deja mover el saldo inicial después de movimientos existentes', async () => {
    const account = await createAccount();
    await createTx(expense(account.id, '1000'));
    expectError(
      await call('PATCH', `/accounts/${account.id}`, { openingBalanceDate: '2026-10-06' }),
      422,
      'RULE_VIOLATION',
      'openingBalanceDate',
    );
  });

  it('aísla los datos entre usuarios', async () => {
    const mine = await createAccount();
    const other = await registerUser(ctx);
    expect((await call('GET', `/accounts/${mine.id}`, undefined, other.cookie)).statusCode).toBe(
      404,
    );
    expect((await call('GET', '/accounts/no-es-un-id', undefined, other.cookie)).statusCode).toBe(
      404,
    );
    expectError(
      await call('POST', '/transactions', expense(mine.id, '1'), other.cookie),
      400,
      'VALIDATION_ERROR',
      'accountId',
    );
    const list = transactionListDtoSchema.parse(
      (await call('GET', '/transactions', undefined, other.cookie)).json(),
    );
    expect(list.data).toEqual([]);
  });

  it('exige sesión y cabecera anti-CSRF', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/accounts' })).statusCode).toBe(401);
    const noCsrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie },
      payload: { name: 'x', type: 'cash', currency: 'COP', openingBalanceDate: '2026-10-01' },
    });
    expect(noCsrf.statusCode).toBe(403);
  });
});

describe('gastos e ingresos', () => {
  it('registra en la moneda de la cuenta y mueve el saldo', async () => {
    const account = await createAccount();
    const food = await categoryId('food');
    const [created] = await createTx(expense(account.id, '150000.50', { categoryId: food }));
    expect(created).toMatchObject({
      type: 'expense',
      direction: 'outflow',
      amount: { amount: '150000.5000', currency: 'COP' },
      original: { amount: '150000.5000', currency: 'COP' },
      base: { amount: '150000.5000', currency: 'COP' },
      fx: null,
      categoryId: food,
      source: 'manual',
    });
    await createTx({
      kind: 'income',
      accountId: account.id,
      amount: '2900000',
      transactionDate: '2026-10-01',
      description: 'Sueldo',
      categoryId: await categoryId('salary'),
    });
    expect(await balanceOf(account.id)).toBe('3749999.5000');
  });

  it('valida categoría, fecha y monto', async () => {
    const account = await createAccount();
    expectError(
      await call(
        'POST',
        '/transactions',
        expense(account.id, '1', { categoryId: await categoryId('salary') }),
      ),
      400,
      'VALIDATION_ERROR',
      'categoryId',
    );
    expectError(
      await call(
        'POST',
        '/transactions',
        expense(account.id, '1', { transactionDate: '2026-09-30' }),
      ),
      422,
      'TRANSACTION_BEFORE_OPENING_BALANCE',
      'transactionDate',
    );
    expectError(
      await call('POST', '/transactions', expense(account.id, '1.23456')),
      400,
      'VALIDATION_ERROR',
      'amount',
    );
    expectError(
      await call('POST', '/transactions', expense(account.id, '1', { fx: { rate: '4000' } })),
      400,
      'VALIDATION_ERROR',
      'fx',
    );
  });

  it('un pendiente se informa aparte en el saldo', async () => {
    const account = await createAccount();
    await createTx(expense(account.id, '20000', { status: 'pending' }));
    const dto = accountDtoSchema.parse((await call('GET', `/accounts/${account.id}`)).json());
    expect(dto.balance).toMatchObject({
      posted: { amount: '1000000.0000' },
      pending: { amount: '-20000.0000' },
      current: { amount: '980000.0000' },
    });
  });
});

describe('compras en otra moneda', () => {
  it('sin TRM guardada pide el valor cobrado o la tasa (nunca la inventa)', async () => {
    const account = await createAccount();
    expectError(
      await call('POST', '/transactions', expense(account.id, '59.99', { currency: 'USD' })),
      422,
      'EXCHANGE_RATE_UNAVAILABLE',
      'fx',
    );
  });

  it('con el valor cobrado: ese valor manda y no es estimado', async () => {
    const account = await createAccount();
    const [created] = await createTx(
      expense(account.id, '59.99', { currency: 'USD', fx: { accountAmount: '243500' } }),
    );
    expect(created).toMatchObject({
      amount: { amount: '243500.0000', currency: 'COP' },
      original: { amount: '59.9900', currency: 'USD' },
      fx: { accountRate: '4059.0098349725', source: 'settled', estimated: false },
    });
  });

  it('con una tasa manual queda marcada como estimación', async () => {
    const account = await createAccount();
    const [created] = await createTx(
      expense(account.id, '59.99', { currency: 'USD', fx: { rate: '4050' } }),
    );
    expect(created?.amount.amount).toBe('242959.5000');
    expect(created?.fx).toMatchObject({ source: 'manual', estimated: true });
  });

  it('usa la TRM vigente, también la del viernes durante el fin de semana', async () => {
    const account = await createAccount();
    await insertTrm('2026-10-02', '4000', '2026-10-05');
    const [created] = await createTx(
      expense(account.id, '10', { currency: 'USD', transactionDate: '2026-10-04' }),
    );
    expect(created).toMatchObject({
      amount: { amount: '40000.0000' },
      fx: { accountRate: '4000.0000000000', source: 'test-trm', estimated: true },
    });
  });

  it('no usa una TRM demasiado vieja', async () => {
    const account = await createAccount({ openingBalanceDate: '2026-09-01' });
    await insertTrm('2026-09-01', '4000');
    expectError(
      await call('POST', '/transactions', expense(account.id, '10', { currency: 'USD' })),
      422,
      'EXCHANGE_RATE_UNAVAILABLE',
    );
  });

  it('una cuenta en USD convierte a la moneda base con la TRM', async () => {
    const usd = await createAccount({ currency: 'USD', openingBalance: '100' });
    await insertTrm('2026-10-05', '4100');
    const [created] = await createTx(expense(usd.id, '20'));
    expect(created).toMatchObject({
      amount: { amount: '20.0000', currency: 'USD' },
      base: { amount: '82000.0000', currency: 'COP' },
      fx: { accountRate: null, baseRate: '4100.0000000000' },
    });
    expect(await balanceOf(usd.id)).toBe('80.0000');
  });
});

describe('transferencias, pagos y reembolsos', () => {
  it('una transferencia crea dos patas, no es gasto y se borra completa', async () => {
    const checking = await createAccount({ name: 'Corriente', type: 'checking' });
    const savings = await createAccount({ name: 'Ahorros', openingBalance: '0' });
    const legs = await createTx({
      kind: 'transfer',
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amount: '300000',
      transactionDate: '2026-10-05',
    });
    expect(legs).toHaveLength(2);
    const [out, inn] = legs;
    expect(out).toMatchObject({
      type: 'transfer',
      direction: 'outflow',
      counterpartAccountId: savings.id,
    });
    expect(inn).toMatchObject({ direction: 'inflow', counterpartAccountId: checking.id });
    expect(out?.transferGroupId).toBe(inn?.transferGroupId);
    expect(await balanceOf(checking.id)).toBe('700000.0000');
    expect(await balanceOf(savings.id)).toBe('300000.0000');

    const flow = cashFlowDtoSchema.parse((await call('GET', '/cash-flow?month=2026-10')).json());
    expect(flow.expenses.amount).toBe('0.0000');
    expect(flow.excluded.transfer).toBe(2);

    expectError(
      await call('PATCH', `/transactions/${out?.id}`, { amount: '1' }),
      409,
      'TRANSACTION_NOT_EDITABLE',
    );
    expect((await call('DELETE', `/transactions/${out?.id}`)).statusCode).toBe(204);
    expect(await balanceOf(savings.id)).toBe('0.0000');
  });

  it('abonar a la tarjeta es un pago que reduce la deuda', async () => {
    const checking = await createAccount({ type: 'checking' });
    const card = await createAccount({
      name: 'Visa',
      type: 'credit_card',
      openingBalance: '500000',
    });
    const [out] = await createTx({
      kind: 'transfer',
      fromAccountId: checking.id,
      toAccountId: card.id,
      amount: '200000',
      transactionDate: '2026-10-06',
    });
    expect(out).toMatchObject({ type: 'payment', description: 'Pago de tarjeta' });
    expect(await balanceOf(card.id)).toBe('300000.0000');
    expect(await balanceOf(checking.id)).toBe('800000.0000');
  });

  it('entre monedas exige lo recibido o la TRM, y valida las fechas', async () => {
    const cop = await createAccount();
    const usd = await createAccount({ currency: 'USD', openingBalance: '0' });
    const base = {
      kind: 'transfer',
      fromAccountId: cop.id,
      toAccountId: usd.id,
      amount: '405000',
      transactionDate: '2026-10-05',
    };
    expectError(
      await call('POST', '/transactions', base),
      422,
      'EXCHANGE_RATE_UNAVAILABLE',
      'receivedAmount',
    );
    const legs = await createTx({ ...base, receivedAmount: '100', receivedDate: '2026-10-06' });
    expect(legs[1]).toMatchObject({
      amount: { amount: '100.0000', currency: 'USD' },
      transactionDate: '2026-10-06',
    });
    expectError(
      await call('POST', '/transactions', {
        ...base,
        receivedAmount: '100',
        receivedDate: '2026-10-04',
      }),
      422,
      'RULE_VIOLATION',
      'receivedDate',
    );
  });

  it('reembolsos parciales con tope en el gasto original', async () => {
    const account = await createAccount();
    const [purchase] = await createTx(
      expense(account.id, '100000', { categoryId: await categoryId('technology') }),
    );
    const refund = { kind: 'refund', refundOfId: purchase?.id, transactionDate: '2026-10-07' };
    const [first] = await createTx({ ...refund, amount: '30000' });
    expect(first).toMatchObject({
      type: 'refund',
      direction: 'inflow',
      categoryId: purchase?.categoryId,
      refundOfId: purchase?.id,
    });
    expectError(
      await call('POST', '/transactions', { ...refund, amount: '70000.01' }),
      422,
      'RULE_VIOLATION',
      'amount',
    );
    expectError(
      await call('POST', '/transactions', {
        ...refund,
        amount: '1',
        transactionDate: '2026-10-04',
      }),
      422,
      'RULE_VIOLATION',
      'transactionDate',
    );
    expectError(
      await call('DELETE', `/transactions/${purchase?.id}`),
      409,
      'TRANSACTION_HAS_REFUNDS',
    );
    expectError(
      await call('PATCH', `/transactions/${purchase?.id}`, { amount: '20000' }),
      422,
      'RULE_VIOLATION',
      'amount',
    );

    const flow = cashFlowDtoSchema.parse((await call('GET', '/cash-flow?month=2026-10')).json());
    expect(flow).toMatchObject({
      expenses: { amount: '100000.0000' },
      refunds: { amount: '30000.0000' },
      netExpenses: { amount: '70000.0000' },
    });
  });
});

describe('edición, listado y flujo', () => {
  it('corrige un gasto y el saldo se recalcula', async () => {
    const account = await createAccount();
    const [created] = await createTx(expense(account.id, '50000'));
    const response = await call('PATCH', `/transactions/${created?.id}`, {
      amount: '45000',
      description: 'Mercado corregido',
      categoryId: await categoryId('food'),
    });
    expect(transactionDtoSchema.parse(response.json())).toMatchObject({
      amount: { amount: '45000.0000' },
      original: { amount: '45000.0000' },
      description: 'Mercado corregido',
    });
    expect(await balanceOf(account.id)).toBe('955000.0000');
  });

  it('no edita el monto de un movimiento con cambio de moneda', async () => {
    const account = await createAccount();
    const [created] = await createTx(
      expense(account.id, '10', { currency: 'USD', fx: { rate: '4000' } }),
    );
    expectError(
      await call('PATCH', `/transactions/${created?.id}`, { amount: '11' }),
      409,
      'TRANSACTION_NOT_EDITABLE',
      'amount',
    );
  });

  it('pagina con cursor, filtra y busca', async () => {
    const account = await createAccount();
    for (const [day, description] of [
      ['2026-10-02', 'Netflix'],
      ['2026-10-03', 'Uber'],
      ['2026-10-04', 'Steam 100% oferta'],
    ] as const) {
      await createTx(expense(account.id, '1000', { transactionDate: day, description }));
    }
    const page1 = transactionListDtoSchema.parse(
      (await call('GET', '/transactions?limit=2')).json(),
    );
    expect(page1.data.map((t) => t.description)).toEqual(['Steam 100% oferta', 'Uber']);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = transactionListDtoSchema.parse(
      (await call('GET', `/transactions?limit=2&cursor=${page1.nextCursor}`)).json(),
    );
    expect(page2.data.map((t) => t.description)).toEqual(['Netflix']);
    expect(page2.nextCursor).toBeNull();

    const search = transactionListDtoSchema.parse(
      (await call('GET', '/transactions?q=100%25')).json(),
    );
    expect(search.data.map((t) => t.description)).toEqual(['Steam 100% oferta']);
    const ranged = transactionListDtoSchema.parse(
      (await call('GET', '/transactions?from=2026-10-03&to=2026-10-03')).json(),
    );
    expect(ranged.data).toHaveLength(1);

    expectError(
      await call('GET', `/transactions?cursor=${cursorCodec.encode('2026-02-30', 'x')}`),
      400,
      'VALIDATION_ERROR',
      'cursor',
    );
    expect(
      cursorCodec.decode(cursorCodec.encode('2026-10-04', '01920000-0000-7000-8000-000000000001')),
    ).toEqual(['2026-10-04', '01920000-0000-7000-8000-000000000001']);
  });

  it('el flujo del mes suma ingresos y gastos en la moneda base', async () => {
    const account = await createAccount();
    await createTx({
      kind: 'income',
      accountId: account.id,
      amount: '2900000',
      transactionDate: '2026-10-01',
      description: 'Sueldo',
    });
    await createTx(expense(account.id, '800000'));
    await createTx(expense(account.id, '50000', { status: 'pending' }));
    await createTx(expense(account.id, '1', { transactionDate: '2026-11-01' }));
    const flow = cashFlowDtoSchema.parse((await call('GET', '/cash-flow?month=2026-10')).json());
    expect(flow).toMatchObject({
      period: { from: '2026-10-01', to: '2026-10-31' },
      income: { amount: '2900000.0000' },
      netExpenses: { amount: '850000.0000' },
      net: { amount: '2050000.0000' },
      savingsRate: '0.7069',
    });
    const posted = cashFlowDtoSchema.parse(
      (await call('GET', '/cash-flow?month=2026-10&includePending=false')).json(),
    );
    expect(posted.excluded.pending).toBe(1);
  });
});

describe('tasas de cambio', () => {
  it('sin datos dice que no hay datos', async () => {
    const lookup = exchangeRateLookupDtoSchema.parse(
      (await call('GET', '/exchange-rates/current?date=2026-10-07')).json(),
    );
    expect(lookup).toEqual({
      date: '2026-10-07',
      status: 'missing',
      daysOutdated: 0,
      rate: null,
      change: null,
    });
  });

  it('muestra la vigente con su variación y el histórico', async () => {
    await insertTrm('2026-10-06', '4000');
    await insertTrm('2026-10-07', '4050');
    const lookup = exchangeRateLookupDtoSchema.parse(
      (await call('GET', '/exchange-rates/current?date=2026-10-07')).json(),
    );
    expect(lookup).toMatchObject({
      status: 'current',
      rate: { rate: '4050.0000000000', source: 'test-trm', rateDate: '2026-10-07' },
      change: { previousRate: '4000.0000000000', absolute: '50.0000000000', relative: '0.0125' },
    });
    const stale = exchangeRateLookupDtoSchema.parse(
      (await call('GET', '/exchange-rates/current?date=2026-10-10')).json(),
    );
    expect(stale).toMatchObject({ status: 'stale', daysOutdated: 3 });
    const history = listOf(exchangeRateLookupDtoSchema.shape.rate.unwrap()).parse(
      (await call('GET', '/exchange-rates?from=2026-10-01&to=2026-10-31')).json(),
    );
    expect(history.data.map((r) => r.rateDate)).toEqual(['2026-10-06', '2026-10-07']);
  });
});
