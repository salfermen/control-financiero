/**
 * Pruebas de integración del modelo de datos contra PostgreSQL real.
 * Verifican que las reglas de integridad viven en la base y no solo en el código.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from './client.js';
import {
  accounts,
  auditLogs,
  categories,
  currencies,
  exchangeRates,
  sessions,
  transactions,
  userSettings,
  users,
} from './schema/index.js';
import { purgeStaleSessions } from './maintenance.js';
import { seedReferenceData } from './seed.js';
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

/** Ejecuta y devuelve el error de PostgreSQL (código SQLSTATE y restricción). */
async function pgError(promise: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
    return {
      code: (cause as { code?: string }).code,
      constraint: (cause as { constraint?: string }).constraint,
    };
  }
  throw new Error('Se esperaba un error de base de datos y la operación tuvo éxito.');
}

async function createUser(email = `u${Math.random().toString(36).slice(2)}@test.co`) {
  const [user] = await handle.db
    .insert(users)
    .values({ email, passwordHash: 'hash-no-real', displayName: 'Prueba' })
    .returning();
  if (!user) throw new Error('no se creó el usuario');
  await handle.db.insert(userSettings).values({ userId: user.id });
  return user;
}

async function createAccount(userId: string, currency = 'COP') {
  const [account] = await handle.db
    .insert(accounts)
    .values({
      userId,
      name: 'Cuenta de ahorros',
      type: 'savings',
      currency,
      openingBalance: '1000000',
      openingBalanceDate: '2026-10-01',
    })
    .returning();
  if (!account) throw new Error('no se creó la cuenta');
  return account;
}

type TxInsert = typeof transactions.$inferInsert;

function expense(userId: string, accountId: string, overrides: Partial<TxInsert> = {}): TxInsert {
  return {
    userId,
    accountId,
    accountCurrency: 'COP',
    type: 'expense',
    direction: 'outflow',
    transactionDate: '2026-10-07',
    description: 'Almuerzo',
    amount: '25000',
    originalAmount: '25000',
    originalCurrency: 'COP',
    baseCurrency: 'COP',
    baseAmount: '25000',
    ...overrides,
  };
}

describe('datos de referencia', () => {
  it('la siembra es idempotente', async () => {
    await seedReferenceData(handle.db);
    await seedReferenceData(handle.db);
    const [row] = await handle.db.select({ n: sql<number>`count(*)::int` }).from(currencies);
    expect(row?.n).toBe(14);
    const [cats] = await handle.db
      .select({ n: sql<number>`count(*)::int` })
      .from(categories)
      .where(sql`${categories.userId} IS NULL`);
    expect(cats?.n).toBe(23);
  });

  it('rechaza códigos de moneda que no son ISO', async () => {
    const err = await pgError(
      handle.db
        .insert(currencies)
        .values({ code: 'cop', nameEs: 'x', nameEn: 'x', minorUnit: 2, displayDecimals: 0 }),
    );
    expect(err.code).toBe('23514');
  });
});

describe('usuarios y sesiones', () => {
  it('exige correo en minúsculas y único', async () => {
    expect((await pgError(createUser('Ana@Test.co'))).constraint).toBe('users_email_lowercase');
    await createUser('ana@test.co');
    expect((await pgError(createUser('ana@test.co'))).code).toBe('23505');
  });

  it('una sesión no puede expirar antes de crearse', async () => {
    const user = await createUser();
    const err = await pgError(
      handle.db.insert(sessions).values({
        userId: user.id,
        tokenHash: 'a'.repeat(64),
        transport: 'cookie',
        expiresAt: new Date(Date.now() - 1000),
      }),
    );
    expect(err.constraint).toBe('sessions_expiry_after_creation');
  });

  it('borrar un usuario elimina en cascada todos sus datos', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    await handle.db.insert(transactions).values(expense(user.id, account.id));
    await handle.db
      .insert(categories)
      .values({ userId: user.id, kind: 'expense', name: 'Mascotas' });
    await handle.db.delete(users).where(eq(users.id, user.id));
    for (const table of [accounts, transactions, userSettings]) {
      const [row] = await handle.db.select({ n: sql<number>`count(*)::int` }).from(table);
      expect(row?.n).toBe(0);
    }
    const [cats] = await handle.db
      .select({ n: sql<number>`count(*)::int` })
      .from(categories)
      .where(sql`${categories.userId} IS NOT NULL`);
    expect(cats?.n).toBe(0);
  });
});

describe('montos y precisión', () => {
  it('guarda montos exactos sin pasar por coma flotante', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const [tx] = await handle.db
      .insert(transactions)
      .values(
        expense(user.id, account.id, {
          amount: '0.3000',
          originalAmount: '0.3',
          baseAmount: '0.3',
        }),
      )
      .returning();
    expect(tx?.amount).toBe('0.3000');
    const [sum] = await handle.db
      .execute<{ total: string }>(
        sql`SELECT (0.1::numeric(20,4) + 0.2::numeric(20,4))::text AS total`,
      )
      .then((r) => r.rows);
    expect(sum?.total).toBe('0.3000');
  });

  it('soporta montos muy grandes con 4 decimales', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const big = '9999999999999999.9999';
    const [tx] = await handle.db
      .insert(transactions)
      .values(expense(user.id, account.id, { amount: big, originalAmount: big, baseAmount: big }))
      .returning();
    expect(tx?.amount).toBe(big);
  });

  it('rechaza montos cero o negativos', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    for (const amount of ['0', '-1']) {
      const err = await pgError(
        handle.db
          .insert(transactions)
          .values(
            expense(user.id, account.id, { amount, originalAmount: amount, baseAmount: amount }),
          ),
      );
      expect(err.code, amount).toBe('23514');
    }
  });

  it('rechaza montos fuera de la precisión NUMERIC(20,4)', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const tooBig = '100000000000000000';
    const err = await pgError(
      handle.db.insert(transactions).values(
        expense(user.id, account.id, {
          amount: tooBig,
          originalAmount: tooBig,
          baseAmount: tooBig,
        }),
      ),
    );
    expect(err.code).toBe('22003');
  });
});

describe('fechas contables', () => {
  it('conserva la fecha exacta sin corrimiento por zona horaria', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    for (const date of ['2026-10-31', '2024-02-29', '2026-01-01', '2026-12-31']) {
      const [tx] = await handle.db
        .insert(transactions)
        .values(expense(user.id, account.id, { transactionDate: date }))
        .returning();
      expect(tx?.transactionDate).toBe(date);
    }
  });

  it('rechaza fechas inexistentes', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const err = await pgError(
      handle.db
        .insert(transactions)
        .values(expense(user.id, account.id, { transactionDate: '2026-02-29' })),
    );
    expect(err.code).toBe('22008');
  });

  it('la fecha de contabilización no puede ser anterior a la de la transacción', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const err = await pgError(
      handle.db
        .insert(transactions)
        .values(expense(user.id, account.id, { postedDate: '2026-10-06' })),
    );
    expect(err.constraint).toBe('transactions_posted_after_transaction');
  });
});

describe('reglas del libro', () => {
  it('el tipo y la dirección deben ser coherentes', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const err = await pgError(
      handle.db.insert(transactions).values(expense(user.id, account.id, { direction: 'inflow' })),
    );
    expect(err.constraint).toBe('transactions_direction_matches_type');
  });

  it('una transferencia exige grupo y no lleva categoría', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const [food] = await handle.db
      .select()
      .from(categories)
      .where(eq(categories.systemKey, 'food'));
    const base = expense(user.id, account.id, { type: 'transfer', direction: 'outflow' });
    expect((await pgError(handle.db.insert(transactions).values(base))).constraint).toBe(
      'transactions_transfer_group_rules',
    );
    expect(
      (
        await pgError(
          handle.db
            .insert(transactions)
            .values({ ...base, transferGroupId: uuidv7(), categoryId: food?.id }),
        )
      ).constraint,
    ).toBe('transactions_transfer_without_category');
    await handle.db.insert(transactions).values({ ...base, transferGroupId: uuidv7() });
  });

  it('un gasto no puede tener grupo de transferencia', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const err = await pgError(
      handle.db
        .insert(transactions)
        .values(expense(user.id, account.id, { transferGroupId: uuidv7() })),
    );
    expect(err.constraint).toBe('transactions_transfer_group_rules');
  });

  it('solo un reembolso puede apuntar a otra transacción', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const [original] = await handle.db
      .insert(transactions)
      .values(expense(user.id, account.id))
      .returning();
    const err = await pgError(
      handle.db
        .insert(transactions)
        .values(expense(user.id, account.id, { refundOfId: original?.id })),
    );
    expect(err.constraint).toBe('transactions_refund_link_only_on_refund');
    await handle.db.insert(transactions).values(
      expense(user.id, account.id, {
        type: 'refund',
        direction: 'inflow',
        refundOfId: original?.id,
      }),
    );
  });

  it('el identificador externo es único por usuario y fuente; los nulos no chocan', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    await handle.db.insert(transactions).values(expense(user.id, account.id));
    await handle.db.insert(transactions).values(expense(user.id, account.id));
    await handle.db
      .insert(transactions)
      .values(expense(user.id, account.id, { source: 'import', externalId: 'X-1' }));
    const err = await pgError(
      handle.db
        .insert(transactions)
        .values(expense(user.id, account.id, { source: 'import', externalId: 'X-1' })),
    );
    expect(err.constraint).toBe('transactions_user_source_external_uq');
  });
});

describe('multimoneda', () => {
  it('una compra en USD sobre cuenta COP exige tasa y trazabilidad', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const usd = expense(user.id, account.id, {
      originalAmount: '59.99',
      originalCurrency: 'USD',
      amount: '242959.50',
      baseAmount: '242959.50',
    });
    expect((await pgError(handle.db.insert(transactions).values(usd))).constraint).toBe(
      'transactions_account_conversion_consistent',
    );
    const withRates = { ...usd, accountFxRate: '4050', baseFxRate: '4050' };
    expect((await pgError(handle.db.insert(transactions).values(withRates))).constraint).toBe(
      'transactions_conversion_traceable',
    );
    const [tx] = await handle.db
      .insert(transactions)
      .values({ ...withRates, fxSource: 'manual', fxConvertedAt: new Date() })
      .returning();
    // El valor original nunca se pierde.
    expect(tx?.originalAmount).toBe('59.9900');
    expect(tx?.originalCurrency).toBe('USD');
    expect(tx?.accountFxRate).toBe('4050.0000000000');
  });

  it('misma moneda: no admite tasa ni montos distintos', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    const err = await pgError(
      handle.db.insert(transactions).values(expense(user.id, account.id, { amount: '25001' })),
    );
    expect(err.constraint).toBe('transactions_account_conversion_consistent');
  });

  it('la moneda del movimiento debe coincidir con la de su cuenta', async () => {
    const user = await createUser();
    const account = await createAccount(user.id, 'COP');
    const err = await pgError(
      handle.db.insert(transactions).values(
        expense(user.id, account.id, {
          accountCurrency: 'USD',
          originalCurrency: 'USD',
          amount: '10',
          originalAmount: '10',
          baseAmount: '40500',
          baseFxRate: '4050',
          fxSource: 'manual',
          fxConvertedAt: new Date(),
        }),
      ),
    );
    expect(err.constraint).toBe('transactions_account_fk');
  });

  it('no se puede cambiar la moneda de una cuenta con movimientos', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    await handle.db.insert(transactions).values(expense(user.id, account.id));
    const err = await pgError(
      handle.db.update(accounts).set({ currency: 'USD' }).where(eq(accounts.id, account.id)),
    );
    expect(err.code).toBe('23503');
  });

  it('las tasas del histórico son positivas, entre monedas distintas e inmutables', async () => {
    const base = {
      baseCurrency: 'USD',
      quoteCurrency: 'COP',
      rateDate: '2026-10-07',
      source: 'test',
      fetchedAt: new Date(),
    };
    expect(
      (await pgError(handle.db.insert(exchangeRates).values({ ...base, rate: '0' }))).code,
    ).toBe('23514');
    expect(
      (
        await pgError(
          handle.db.insert(exchangeRates).values({ ...base, quoteCurrency: 'USD', rate: '1' }),
        )
      ).constraint,
    ).toBe('exchange_rates_distinct_pair');
    const [rate] = await handle.db
      .insert(exchangeRates)
      .values({ ...base, rate: '4050.25' })
      .returning();
    expect(
      (await pgError(handle.db.insert(exchangeRates).values({ ...base, rate: '4100' }))).code,
    ).toBe('23505');
    const err = await pgError(
      handle.db
        .update(exchangeRates)
        .set({ rate: '1' })
        .where(eq(exchangeRates.id, rate?.id ?? '')),
    );
    expect(err.code).toBe('42501');
  });
});

describe('aislamiento entre usuarios', () => {
  it('un movimiento no puede apuntar a la cuenta de otro usuario', async () => {
    const ana = await createUser();
    const luis = await createUser();
    const cuentaDeLuis = await createAccount(luis.id);
    const err = await pgError(
      handle.db.insert(transactions).values(expense(ana.id, cuentaDeLuis.id)),
    );
    expect(err.constraint).toBe('transactions_account_fk');
  });

  it('no se puede borrar físicamente una cuenta con historial', async () => {
    const user = await createUser();
    const account = await createAccount(user.id);
    await handle.db.insert(transactions).values(expense(user.id, account.id));
    expect(
      (await pgError(handle.db.delete(accounts).where(eq(accounts.id, account.id)))).code,
    ).toBe('23503');
  });
});

describe('categorías', () => {
  it('una categoría es del sistema o del usuario, nunca ambas', async () => {
    const user = await createUser();
    const err = await pgError(
      handle.db
        .insert(categories)
        .values({ userId: user.id, systemKey: 'hack', kind: 'expense', name: 'X' }),
    );
    expect(err.constraint).toBe('categories_system_xor_user');
  });

  it('nombre único por usuario, reutilizable tras borrado lógico', async () => {
    const user = await createUser();
    const [first] = await handle.db
      .insert(categories)
      .values({ userId: user.id, kind: 'expense', name: 'Mascotas' })
      .returning();
    expect(
      (
        await pgError(
          handle.db
            .insert(categories)
            .values({ userId: user.id, kind: 'expense', name: 'Mascotas' }),
        )
      ).code,
    ).toBe('23505');
    await handle.db
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(eq(categories.id, first?.id ?? ''));
    await handle.db
      .insert(categories)
      .values({ userId: user.id, kind: 'expense', name: 'Mascotas' });
  });
});

describe('auditoría', () => {
  it('es de solo inserción', async () => {
    const [log] = await handle.db
      .insert(auditLogs)
      .values({ actorType: 'system', action: 'test_event' })
      .returning();
    const err = await pgError(
      handle.db
        .update(auditLogs)
        .set({ action: 'reescrito' })
        .where(eq(auditLogs.id, log?.id ?? '')),
    );
    expect(err.code).toBe('42501');
  });
});

describe('mantenimiento', () => {
  it('purga solo sesiones vencidas o revocadas fuera del margen', async () => {
    const user = await createUser();
    const now = new Date('2026-10-07T12:00:00Z');
    const day = 86_400_000;
    const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * day);
    const make = (suffix: string, values: Partial<typeof sessions.$inferInsert>) =>
      handle.db.insert(sessions).values({
        userId: user.id,
        tokenHash: suffix.repeat(64),
        transport: 'cookie',
        createdAt: at(-100),
        lastUsedAt: at(-100),
        expiresAt: at(10),
        ...values,
      });
    await make('a', { expiresAt: at(-31) }); // vencida hace 31 días → se borra
    await make('b', { expiresAt: at(-29) }); // vencida hace 29 días → se conserva
    await make('c', { revokedAt: at(-40) }); // revocada hace 40 días → se borra
    await make('d', {}); // vigente → se conserva

    expect(await purgeStaleSessions(handle.db, now, 30)).toBe(2);
    const left = await handle.db.select({ hash: sessions.tokenHash }).from(sessions);
    expect(left.map((s) => s.hash[0]).sort()).toEqual(['b', 'd']);
    await expect(purgeStaleSessions(handle.db, now, -1)).rejects.toThrow(RangeError);
  });
});
