/**
 * Integración F5a: saldo después de lo programado, categorías propias,
 * presupuestos y resumen del tablero, a través de la API real contra
 * PostgreSQL. Las fechas se calculan desde «hoy» del usuario para que las
 * pruebas no dependan del día en que corren.
 */
import { auditLogs, exchangeRates, transactions } from '@cf/db';
import {
  addDays,
  addMonths,
  compareLocalDates,
  endOfMonth,
  localDateInTimeZone,
  startOfMonth,
  yearMonthOf,
} from '@cf/domain';
import {
  type AccountDto,
  type CategoryDto,
  accountDtoSchema,
  apiErrorBodySchema,
  budgetStatusDtoSchema,
  budgetsMonthDtoSchema,
  cashFlowDtoSchema,
  categoryDtoSchema,
  listOf,
  summaryDtoSchema,
} from '@cf/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
/** «Hoy» del usuario de prueba (zona por defecto America/Bogota). */
let today: string;

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
  today = localDateInTimeZone(new Date(), 'America/Bogota');
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

async function createAccount(overrides: Record<string, unknown> = {}): Promise<AccountDto> {
  const response = await call('POST', '/accounts', {
    name: 'Ahorros',
    type: 'savings',
    currency: 'COP',
    openingBalance: '1000000',
    openingBalanceDate: startOfMonth(today),
    ...overrides,
  });
  expect(response.statusCode, response.body).toBe(201);
  return accountDtoSchema.parse(response.json());
}

async function spend(
  accountId: string,
  amount: string,
  transactionDate: string,
  extra: Record<string, unknown> = {},
) {
  const response = await call('POST', '/transactions', {
    kind: 'expense',
    accountId,
    amount,
    transactionDate,
    description: 'Gasto',
    ...extra,
  });
  expect(response.statusCode, response.body).toBe(201);
}

async function categories(): Promise<CategoryDto[]> {
  return listOf(categoryDtoSchema).parse((await call('GET', '/categories')).json()).data;
}

async function systemCategory(key: string): Promise<string> {
  const found = (await categories()).find((c) => c.systemKey === key);
  if (!found) throw new Error(`Categoría ${key} no sembrada`);
  return found.id;
}

async function account(id: string): Promise<AccountDto> {
  return accountDtoSchema.parse((await call('GET', `/accounts/${id}`)).json());
}

describe('saldo después de lo programado', () => {
  it('una cuenta que empieza en el futuro: hoy sin saldo, «te queda» con lo programado', async () => {
    // Caso real: el sueldo llega el día X como saldo inicial y sus gastos ya están registrados.
    const payday = addDays(today, 20);
    const salary = await createAccount({
      name: 'Sueldo',
      openingBalance: '1500000',
      openingBalanceDate: payday,
    });
    await spend(salary.id, '1000000', payday);
    await spend(salary.id, '267633', addDays(payday, 1));
    await spend(salary.id, '162000', addDays(payday, 1));

    const { balance } = await account(salary.id);
    expect(balance).toMatchObject({
      asOf: today,
      startsOn: payday,
      current: { amount: '0.0000' },
      scheduled: { amount: '70367.0000' },
      projected: { amount: '70367.0000' },
      projectedThrough: addDays(payday, 1),
      transactionCount: 0,
      scheduledCount: 3,
    });
  });

  it('separa el saldo de hoy de los movimientos con fecha futura', async () => {
    const savings = await createAccount({ openingBalanceDate: today });
    await spend(savings.id, '100000', today);
    await spend(savings.id, '250000', addDays(today, 3), { status: 'pending' });

    const listed = listOf(accountDtoSchema).parse((await call('GET', '/accounts')).json()).data;
    expect(listed[0]?.balance).toMatchObject({
      startsOn: null,
      current: { amount: '900000.0000' },
      scheduled: { amount: '-250000.0000' },
      projected: { amount: '650000.0000' },
      transactionCount: 1,
      scheduledCount: 1,
    });
  });
});

describe('categorías personalizadas', () => {
  it('crea, valida nombres y niveles, renombra y no toca las del sistema', async () => {
    const created = await call('POST', '/categories', { name: 'Mascotas', kind: 'expense' });
    expect(created.statusCode, created.body).toBe(201);
    const pets = categoryDtoSchema.parse(created.json());
    expect(pets).toMatchObject({ name: 'Mascotas', isSystem: false, parentId: null });

    expectError(
      await call('POST', '/categories', { name: '  mascotas ', kind: 'expense' }),
      409,
      'CATEGORY_NAME_TAKEN',
    );
    // También choca con las del sistema, sin importar tildes ni idioma.
    expectError(
      await call('POST', '/categories', { name: 'VIDEOJUEGOS', kind: 'expense' }),
      409,
      'CATEGORY_NAME_TAKEN',
    );
    expectError(
      await call('POST', '/categories', { name: 'Educacion', kind: 'expense' }),
      409,
      'CATEGORY_NAME_TAKEN',
    );
    // El mismo nombre en el otro tipo sí se permite.
    expect(
      (await call('POST', '/categories', { name: 'Mascotas', kind: 'income' })).statusCode,
    ).toBe(201);

    const entertainment = await systemCategory('entertainment');
    const sub = await call('POST', '/categories', {
      name: 'Conciertos',
      kind: 'expense',
      parentId: entertainment,
    });
    expect(sub.statusCode, sub.body).toBe(201);
    const videoGames = await systemCategory('video_games');
    expectError(
      await call('POST', '/categories', { name: 'Retro', kind: 'expense', parentId: videoGames }),
      400,
      'VALIDATION_ERROR',
      'parentId',
    );
    expectError(
      await call('POST', '/categories', {
        name: 'Bonos extra',
        kind: 'income',
        parentId: entertainment,
      }),
      400,
      'VALIDATION_ERROR',
      'parentId',
    );

    const renamed = await call('PATCH', `/categories/${pets.id}`, {
      name: 'Mascotas y veterinario',
    });
    expect(categoryDtoSchema.parse(renamed.json()).name).toBe('Mascotas y veterinario');
    expectError(
      await call('PATCH', `/categories/${entertainment}`, { name: 'Ocio' }),
      403,
      'FORBIDDEN',
    );
    expectError(await call('DELETE', `/categories/${entertainment}`), 403, 'FORBIDDEN');

    const actions = await ctx.db.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId));
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['category_created', 'category_updated']),
    );
  });

  it('una categoría con subcategorías no puede volverse subcategoría', async () => {
    const parent = categoryDtoSchema.parse(
      (await call('POST', '/categories', { name: 'Hogar extra', kind: 'expense' })).json(),
    );
    await call('POST', '/categories', { name: 'Plantas', kind: 'expense', parentId: parent.id });
    expectError(
      await call('PATCH', `/categories/${parent.id}`, {
        parentId: await systemCategory('housing'),
      }),
      422,
      'RULE_VIOLATION',
      'parentId',
    );
  });

  it('eliminar: con movimientos exige mover; con subcategorías o presupuesto se rechaza', async () => {
    const savings = await createAccount();
    const pets = categoryDtoSchema.parse(
      (await call('POST', '/categories', { name: 'Mascotas', kind: 'expense' })).json(),
    );
    await spend(savings.id, '80000', startOfMonth(today), { categoryId: pets.id });

    expectError(await call('DELETE', `/categories/${pets.id}`), 409, 'CATEGORY_IN_USE', 'moveTo');
    expectError(
      await call('DELETE', `/categories/${pets.id}?moveTo=${await systemCategory('salary')}`),
      400,
      'VALIDATION_ERROR',
      'moveTo',
    );
    const other = await systemCategory('other_expense');
    const deleted = await call('DELETE', `/categories/${pets.id}?moveTo=${other}`);
    expect(deleted.statusCode, deleted.body).toBe(204);

    const moved = await ctx.db.db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.userId, userId));
    expect(moved.map((t) => t.categoryId)).toEqual([other]);
    expect((await categories()).some((c) => c.id === pets.id)).toBe(false);
    const [audit] = await ctx.db.db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, userId), eq(auditLogs.action, 'category_deleted')));
    expect(audit?.metadata).toMatchObject({ movedTransactions: 1, moveTo: other });

    const parent = categoryDtoSchema.parse(
      (await call('POST', '/categories', { name: 'Hobbies', kind: 'expense' })).json(),
    );
    await call('POST', '/categories', { name: 'Pintura', kind: 'expense', parentId: parent.id });
    expectError(await call('DELETE', `/categories/${parent.id}`), 409, 'CATEGORY_IN_USE');

    const budgeted = categoryDtoSchema.parse(
      (await call('POST', '/categories', { name: 'Gimnasio', kind: 'expense' })).json(),
    );
    await call('POST', '/budgets', { categoryId: budgeted.id, amount: '100000' });
    expectError(await call('DELETE', `/categories/${budgeted.id}`), 409, 'CATEGORY_IN_USE');
  });

  it('cada usuario ve y edita solo sus categorías', async () => {
    const mine = categoryDtoSchema.parse(
      (await call('POST', '/categories', { name: 'Privada', kind: 'expense' })).json(),
    );
    const other = await registerUser(ctx);
    const theirs = listOf(categoryDtoSchema)
      .parse((await call('GET', '/categories', undefined, other.cookie)).json())
      .data.map((c) => c.id);
    expect(theirs).not.toContain(mine.id);
    expectError(
      await call('PATCH', `/categories/${mine.id}`, { name: 'Robada' }, other.cookie),
      404,
      'NOT_FOUND',
    );
    expectError(
      await call('DELETE', `/categories/${mine.id}`, undefined, other.cookie),
      404,
      'NOT_FOUND',
    );
  });
});

describe('presupuestos', () => {
  const thisMonth = () => yearMonthOf(today);
  const nextMonth = () => yearMonthOf(addMonths(startOfMonth(today), 1));

  async function monthBudgets(month = thisMonth()) {
    const response = await call('GET', `/budgets?month=${month}`);
    expect(response.statusCode, response.body).toBe(200);
    return budgetsMonthDtoSchema.parse(response.json());
  }

  it('calcula lo gastado con subcategorías, alerta por umbrales y aísla usuarios', async () => {
    const savings = await createAccount();
    const entertainment = await systemCategory('entertainment');
    const videoGames = await systemCategory('video_games');
    const food = await systemCategory('food');

    const created = await call('POST', '/budgets', { categoryId: entertainment, amount: '300000' });
    expect(created.statusCode, created.body).toBe(201);
    expect(budgetStatusDtoSchema.parse(created.json())).toMatchObject({
      categoryName: 'Entretenimiento',
      subcategoryCount: 1,
      validFrom: startOfMonth(today),
      validTo: null,
      level: 'ok',
    });
    await call('POST', '/budgets', { categoryId: null, amount: '2000000' });

    await spend(savings.id, '180000', today, { categoryId: videoGames });
    await spend(savings.id, '999999', today, { categoryId: food });
    let month = await monthBudgets();
    expect(month.thresholds).toEqual({ notice: '0.75', warning: '0.90', exceeded: '1' });
    expect(month.budgets.map((b) => b.categoryName)).toEqual([null, 'Entretenimiento']);
    expect(month.budgets[1]).toMatchObject({
      spent: { amount: '180000.0000' },
      remaining: { amount: '120000.0000' },
      usedRatio: '0.6000',
      level: 'ok',
      transactionCount: 1,
    });
    expect(month.budgets[0]?.spent.amount).toBe('1179999.0000');

    await spend(savings.id, '50000', today, { categoryId: entertainment });
    month = await monthBudgets();
    expect(month.budgets[1]).toMatchObject({ usedRatio: '0.7667', level: 'notice' });

    // Otro usuario no ve ni edita estos presupuestos.
    const other = await registerUser(ctx);
    const theirs = budgetsMonthDtoSchema.parse(
      (await call('GET', '/budgets', undefined, other.cookie)).json(),
    );
    expect(theirs.budgets).toEqual([]);
    const id = month.budgets[1]?.id ?? '';
    expectError(
      await call('PATCH', `/budgets/${id}`, { amount: '1' }, other.cookie),
      404,
      'NOT_FOUND',
    );
  });

  it('valida categoría, duplicados y monto', async () => {
    const food = await systemCategory('food');
    await call('POST', '/budgets', { categoryId: food, amount: '500000' });
    expectError(
      await call('POST', '/budgets', { categoryId: food, amount: '1' }),
      409,
      'BUDGET_EXISTS',
    );
    // Uno que empieza más adelante también se solapa con el vigente sin fin.
    expectError(
      await call('POST', '/budgets', { categoryId: food, amount: '1', startMonth: nextMonth() }),
      409,
      'BUDGET_EXISTS',
    );
    expectError(
      await call('POST', '/budgets', { categoryId: await systemCategory('salary'), amount: '1' }),
      400,
      'VALIDATION_ERROR',
      'categoryId',
    );
    expectError(
      await call('POST', '/budgets', { categoryId: food, amount: '0' }),
      400,
      'VALIDATION_ERROR',
      'amount',
    );
  });

  it('cambiar el límite no reescribe meses pasados; quitarlo conserva el historial', async () => {
    const food = await systemCategory('food');
    const previous = yearMonthOf(addMonths(startOfMonth(today), -1));
    const created = budgetStatusDtoSchema.parse(
      (
        await call('POST', '/budgets', { categoryId: food, amount: '400000', startMonth: previous })
      ).json(),
    );
    expect(created.validFrom).toBe(`${previous}-01`);

    // Cambio desde este mes: el mes anterior conserva 400.000.
    const changed = await call('PATCH', `/budgets/${created.id}`, { amount: '450000' });
    expect(changed.statusCode, changed.body).toBe(200);
    const current = budgetStatusDtoSchema.parse(changed.json());
    expect(current).toMatchObject({
      limit: { amount: '450000.0000' },
      validFrom: startOfMonth(today),
    });
    expect(current.id).not.toBe(created.id);
    expect((await monthBudgets(previous)).budgets[0]).toMatchObject({
      id: created.id,
      limit: { amount: '400000.0000' },
      validTo: addDays(startOfMonth(today), -1),
    });

    // Otro cambio en el mismo mes edita la misma versión.
    const again = budgetStatusDtoSchema.parse(
      (await call('PATCH', `/budgets/${current.id}`, { amount: '480000' })).json(),
    );
    expect(again.id).toBe(current.id);

    // Un mes en que la versión no rige se rechaza.
    expectError(
      await call('PATCH', `/budgets/${created.id}`, { amount: '1', fromMonth: thisMonth() }),
      422,
      'RULE_VIOLATION',
      'fromMonth',
    );

    // Quitar desde el mes siguiente: este mes sigue presupuestado.
    expect(
      (await call('DELETE', `/budgets/${current.id}?fromMonth=${nextMonth()}`)).statusCode,
    ).toBe(204);
    expect((await monthBudgets(nextMonth())).budgets).toEqual([]);
    expect((await monthBudgets()).budgets[0]?.validTo).toBe(endOfMonth(today));

    // Quitar desde el mes en que empieza la versión la elimina.
    expect((await call('DELETE', `/budgets/${current.id}`)).statusCode).toBe(204);
    expect((await monthBudgets()).budgets).toEqual([]);
    expect((await monthBudgets(previous)).budgets).toHaveLength(1);

    const actions = await ctx.db.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId));
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['budget_created', 'budget_changed', 'budget_deleted']),
    );
  });

  it('con presupuestos, la moneda base queda bloqueada', async () => {
    await call('POST', '/budgets', { categoryId: null, amount: '1000000' });
    expectError(
      await call('PATCH', '/me/settings', { baseCurrency: 'USD' }),
      409,
      'BASE_CURRENCY_LOCKED',
    );
  });
});

describe('resumen del tablero', () => {
  it('sin datos responde ceros, sin inventar nada', async () => {
    const summary = summaryDtoSchema.parse((await call('GET', '/summary')).json());
    expect(summary).toMatchObject({
      asOf: today,
      monthEnd: endOfMonth(today),
      baseCurrency: 'COP',
      position: {
        today: { liquid: { amount: '0.0000' }, netWorth: { amount: '0.0000' } },
        accounts: [],
        unconverted: [],
        estimated: false,
      },
      budgets: { count: 0, top: [] },
      upcoming: [],
    });
  });

  it('disponible, deudas y patrimonio, con lo programado y sin inventar tasas', async () => {
    const savings = await createAccount({ openingBalance: '2000000' });
    await createAccount({
      name: 'Tarjeta',
      type: 'credit_card',
      openingBalance: '450000',
    });
    await createAccount({ name: 'Ajena', openingBalance: '999', includeInNetWorth: false });
    const wallet = await createAccount({
      name: 'Billetera USD',
      type: 'digital_wallet',
      currency: 'USD',
      openingBalance: '100',
    });
    await spend(savings.id, '100000', today);
    const tomorrow = addDays(today, 1);
    const inMonth = compareLocalDates(tomorrow, endOfMonth(today)) <= 0;
    await spend(savings.id, '30000', tomorrow, { description: 'Programado' });
    await spend(savings.id, '1', addMonths(today, 2), { description: 'Lejano' });

    let summary = summaryDtoSchema.parse((await call('GET', '/summary')).json());
    expect(summary.position.today).toMatchObject({
      liquid: { amount: '1900000.0000' },
      liabilities: { amount: '450000.0000' },
      netWorth: { amount: '1450000.0000' },
    });
    expect(summary.position.endOfMonth.liquid.amount).toBe(
      inMonth ? '1870000.0000' : '1900000.0000',
    );
    expect(summary.position.scheduledAfterMonthEnd).toBe(inMonth ? 1 : 2);
    expect(summary.position.unconverted).toEqual([
      { accountId: wallet.id, name: 'Billetera USD', currency: 'USD', reason: 'missing_rate' },
    ]);
    expect(summary.position.excluded.map((a) => a.name)).toEqual(['Ajena']);
    expect(summary.upcoming.map((u) => u.description)).toEqual(['Programado', 'Lejano']);
    expect(summary.upcoming[0]).toMatchObject({
      direction: 'outflow',
      amount: { amount: '30000.0000' },
    });
    expect(summary.month).toMatchObject({
      netExpenses: { amount: inMonth ? '130000.0000' : '100000.0000' },
      scheduled: { count: inMonth ? 1 : 0 },
    });

    // Con la TRM de hoy, la billetera se suma convertida y con su tasa.
    await ctx.db.db.insert(exchangeRates).values({
      baseCurrency: 'USD',
      quoteCurrency: 'COP',
      rate: '3216.01',
      rateDate: today,
      source: 'test-trm',
      fetchedAt: new Date(),
    });
    summary = summaryDtoSchema.parse((await call('GET', '/summary')).json());
    expect(summary.position.unconverted).toEqual([]);
    expect(summary.position.today.liquid.amount).toBe('2221601.0000');
    expect(summary.position.accounts.find((a) => a.accountId === wallet.id)).toMatchObject({
      today: { amount: '321601.0000', currency: 'COP' },
      conversion: { rate: '3216.0100000000', source: 'test-trm', stale: false },
    });
  });

  it('el flujo de caja informa la parte programada del mes', async () => {
    const savings = await createAccount();
    await spend(savings.id, '10000', today);
    const flow = cashFlowDtoSchema.parse(
      (
        await call('GET', `/cash-flow?month=${yearMonthOf(addMonths(startOfMonth(today), 1))}`)
      ).json(),
    );
    expect(flow.scheduled).toMatchObject({ asOf: today, count: 0 });
  });
});
