import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, categories, transactions, uuidv7 } from '@cf/db';
import {
  type AccountConversion,
  type ExchangeRate,
  type LedgerAmounts,
  type LedgerEntry,
  Money,
  REQUIRED_DIRECTION,
  accountNature,
  assertValidLedgerEntry,
  assertValidRefund,
  assertValidTransferGroup,
  compareLocalDates,
  createExchangeRate,
  isDomainError,
  isValidLocalDate,
  prepareLedgerAmounts,
} from '@cf/domain';
import type {
  FieldIssue,
  TransactionDto,
  TransactionListDto,
  createTransactionRequestSchema,
  transactionListQuerySchema,
  updateTransactionRequestSchema,
} from '@cf/shared';
import { type SQL, and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type AccountRow, AccountsService } from '../accounts/accounts.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { MANUAL_FX_SOURCE, SETTLED_FX_SOURCE, transactionToDto } from '../finance/dto.js';
import {
  type Executor,
  type FinanceContext,
  FinanceContextService,
} from '../finance/finance-context.service.js';
import { ExchangeRatesService } from '../fx/exchange-rates.service.js';

type CreateInput = z.output<typeof createTransactionRequestSchema>;
type SingleInput = Extract<CreateInput, { kind: 'expense' | 'income' | 'fee' }>;
type TransferInput = Extract<CreateInput, { kind: 'transfer' }>;
type RefundInput = Extract<CreateInput, { kind: 'refund' }>;
type UpdateInput = z.output<typeof updateTransactionRequestSchema>;
type ListQuery = z.output<typeof transactionListQuerySchema>;
type TransactionRow = typeof transactions.$inferSelect;
type NewTransaction = typeof transactions.$inferInsert & { id: string };

const rule = (path: string, message: string): AppError =>
  new AppError('RULE_VIOLATION', [{ path, message }]);
const invalid = (path: string, message: string): AppError =>
  new AppError('VALIDATION_ERROR', [{ path, message }]);

/**
 * Libro de movimientos. Este servicio solo orquesta: los montos, conversiones
 * y reglas los decide el Financial Engine (@cf/domain), y la base vuelve a
 * verificarlos con sus CHECK.
 */
@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly finance: FinanceContextService,
    private readonly accounts: AccountsService,
    private readonly rates: ExchangeRatesService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(userId: string, query: ListQuery): Promise<TransactionListDto> {
    const conditions: (SQL | undefined)[] = [
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      query.from ? gte(transactions.transactionDate, query.from) : undefined,
      query.to ? lte(transactions.transactionDate, query.to) : undefined,
      query.accountId ? eq(transactions.accountId, query.accountId) : undefined,
      query.categoryId ? eq(transactions.categoryId, query.categoryId) : undefined,
      query.type ? eq(transactions.type, query.type) : undefined,
      query.status ? eq(transactions.status, query.status) : undefined,
    ];
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        or(ilike(transactions.description, pattern), ilike(transactions.merchantName, pattern)),
      );
    }
    if (query.cursor) {
      const [date, id] = decodeCursor(query.cursor);
      conditions.push(
        sql`(${transactions.transactionDate}, ${transactions.id}) < (${date}::date, ${id}::uuid)`,
      );
    }
    const rows = await this.database.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.transactionDate), desc(transactions.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const counterparts = await this.counterparts(userId, page);
    return {
      data: page.map((row) => transactionToDto(row, counterparts.get(row.id) ?? null)),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(last.transactionDate, last.id) : null,
    };
  }

  async get(userId: string, id: string): Promise<TransactionDto> {
    const row = await this.findOwned(userId, id);
    const counterparts = await this.counterparts(userId, [row]);
    return transactionToDto(row, counterparts.get(row.id) ?? null);
  }

  // --------------------------------------------------------------- creación

  /** Crea un movimiento. Una transferencia devuelve sus dos patas. */
  async create(
    userId: string,
    input: CreateInput,
    requestContext: RequestContext,
  ): Promise<TransactionDto[]> {
    const rows = await this.database.db.transaction(async (tx) => {
      const context = await this.finance.load(userId, tx);
      let created: NewTransaction[];
      switch (input.kind) {
        case 'transfer':
          created = await this.buildTransfer(tx, context, input);
          break;
        case 'refund':
          created = [await this.buildRefund(tx, context, input)];
          break;
        default:
          created = [await this.buildSingle(tx, context, input)];
      }
      const inserted = await tx.insert(transactions).values(created).returning();
      for (const row of inserted) {
        await this.audit.record(
          {
            action: 'transaction_created',
            userId,
            entityType: 'transaction',
            entityId: row.id,
            metadata: { type: row.type, accountId: row.accountId },
            context: requestContext,
          },
          tx,
        );
      }
      return inserted;
    });
    const counterparts = await this.counterparts(userId, rows);
    return rows.map((row) => transactionToDto(row, counterparts.get(row.id) ?? null));
  }

  private async buildSingle(
    tx: Executor,
    context: FinanceContext,
    input: SingleInput,
  ): Promise<NewTransaction> {
    const account = await this.requireAccount(tx, context.userId, input.accountId, 'accountId');
    this.assertAfterOpening(account, input.transactionDate, 'transactionDate');
    if (input.categoryId) {
      await this.assertCategory(
        tx,
        context.userId,
        input.categoryId,
        input.kind === 'income' ? 'income' : 'expense',
      );
    }
    const original = toMoney(input.amount, input.currency ?? account.currency, 'amount');
    const amounts = await this.ledgerAmounts(tx, context, {
      original,
      account,
      date: input.transactionDate,
      fx: input.fx,
      fxPath: 'fx',
    });
    return this.validated({
      id: uuidv7(),
      userId: context.userId,
      accountId: account.id,
      type: input.kind,
      direction: REQUIRED_DIRECTION[input.kind] ?? 'outflow',
      status: input.status,
      transactionDate: input.transactionDate,
      description: input.description,
      merchantName: input.merchantName ?? null,
      categoryId: input.categoryId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      transferGroupId: null,
      refundOfId: null,
      source: 'manual',
      ...amounts,
    });
  }

  private async buildTransfer(
    tx: Executor,
    context: FinanceContext,
    input: TransferInput,
  ): Promise<NewTransaction[]> {
    const from = await this.requireAccount(
      tx,
      context.userId,
      input.fromAccountId,
      'fromAccountId',
    );
    const to = await this.requireAccount(tx, context.userId, input.toAccountId, 'toAccountId');
    const receivedDate = input.receivedDate ?? input.transactionDate;
    this.assertAfterOpening(from, input.transactionDate, 'transactionDate');
    this.assertAfterOpening(
      to,
      receivedDate,
      input.receivedDate ? 'receivedDate' : 'transactionDate',
    );

    const sent = toMoney(input.amount, from.currency, 'amount');
    if (from.currency === to.currency && input.receivedAmount !== undefined) {
      if (!toMoney(input.receivedAmount, to.currency, 'receivedAmount').equals(sent)) {
        throw rule('receivedAmount', 'Entre cuentas de la misma moneda llega lo mismo que sale.');
      }
    }
    // Abonar a una tarjeta o a un préstamo es un pago, no un gasto.
    const type: 'payment' | 'transfer' =
      accountNature(to.type) === 'liability' ? 'payment' : 'transfer';
    const description =
      input.description ??
      (type === 'payment'
        ? to.type === 'credit_card'
          ? 'Pago de tarjeta'
          : 'Pago de crédito'
        : 'Transferencia entre cuentas');
    const groupId = uuidv7();
    const common = {
      userId: context.userId,
      type,
      status: input.status,
      description,
      notes: input.notes ?? null,
      categoryId: null,
      merchantName: null,
      paymentMethod: 'bank_transfer' as const,
      transferGroupId: groupId,
      refundOfId: null,
      source: 'manual' as const,
    };

    const outflow = this.validated({
      ...common,
      id: uuidv7(),
      accountId: from.id,
      direction: 'outflow',
      transactionDate: input.transactionDate,
      ...(await this.ledgerAmounts(tx, context, {
        original: sent,
        account: from,
        date: input.transactionDate,
        fxPath: 'amount',
      })),
    });
    // La pata de entrada conserva como original lo que salió: si hubo cambio de
    // moneda, queda registrada la tasa (o el valor recibido) que lo explica.
    const inflow = this.validated({
      ...common,
      id: uuidv7(),
      accountId: to.id,
      direction: 'inflow',
      transactionDate: receivedDate,
      ...(await this.ledgerAmounts(tx, context, {
        original: sent,
        account: to,
        date: receivedDate,
        fx:
          input.receivedAmount !== undefined ? { accountAmount: input.receivedAmount } : undefined,
        fxPath: 'receivedAmount',
      })),
    });
    try {
      assertValidTransferGroup([toEntry(outflow), toEntry(inflow)]);
    } catch (error) {
      if (isDomainError(error) && error.details.rule === 'inflow_before_outflow') {
        throw rule('receivedDate', 'El dinero no puede llegar antes de salir.');
      }
      throw error;
    }
    return [outflow, inflow];
  }

  private async buildRefund(
    tx: Executor,
    context: FinanceContext,
    input: RefundInput,
  ): Promise<NewTransaction> {
    const original = await this.findOwned(context.userId, input.refundOfId, tx).catch(() => {
      throw invalid('refundOfId', 'No encontramos el gasto a reembolsar.');
    });
    const account = await this.requireAccount(tx, context.userId, original.accountId, 'refundOfId');
    this.assertAfterOpening(account, input.transactionDate, 'transactionDate');
    const previous = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.refundOfId, original.id), isNull(transactions.deletedAt)));

    const amount = toMoney(input.amount, original.originalCurrency, 'amount');
    const refund = this.validated({
      id: uuidv7(),
      userId: context.userId,
      accountId: account.id,
      type: 'refund',
      direction: 'inflow',
      status: input.status,
      transactionDate: input.transactionDate,
      description: input.description ?? `Reembolso: ${original.description}`.slice(0, 255),
      merchantName: original.merchantName,
      categoryId: original.categoryId,
      paymentMethod: original.paymentMethod,
      notes: input.notes ?? null,
      transferGroupId: null,
      refundOfId: original.id,
      source: 'manual',
      ...(await this.ledgerAmounts(tx, context, {
        original: amount,
        account,
        date: input.transactionDate,
        fx: input.fx,
        fxPath: 'fx',
      })),
    });
    try {
      assertValidRefund(toEntry(refund), original, previous);
    } catch (error) {
      if (!isDomainError(error) || error.code !== 'INVALID_REFUND') throw error;
      throw refundIssue(String(error.details.rule));
    }
    return refund;
  }

  // ----------------------------------------------------------- modificación

  async update(
    userId: string,
    id: string,
    input: UpdateInput,
    requestContext: RequestContext,
  ): Promise<TransactionDto> {
    const updated = await this.database.db.transaction(async (tx) => {
      const current = await this.findOwned(userId, id, tx);
      const isTransferLeg = current.transferGroupId !== null;
      const descriptiveOnly = ['description', 'notes', 'status'];
      const fields = Object.keys(input);
      if (
        (isTransferLeg || current.type === 'refund') &&
        fields.some((field) => !descriptiveOnly.includes(field))
      ) {
        throw new AppError('TRANSACTION_NOT_EDITABLE', [
          {
            path: fields.find((field) => !descriptiveOnly.includes(field)) ?? '',
            message:
              'En transferencias, pagos y reembolsos solo se edita la descripción, las notas o el estado.',
          },
        ]);
      }

      const changes: Partial<typeof transactions.$inferInsert> = {};
      if (input.description !== undefined) changes.description = input.description;
      if (input.merchantName !== undefined) changes.merchantName = input.merchantName;
      if (input.notes !== undefined) changes.notes = input.notes;
      if (input.paymentMethod !== undefined) changes.paymentMethod = input.paymentMethod;
      if (input.status !== undefined) changes.status = input.status;
      if (input.categoryId !== undefined) {
        if (input.categoryId !== null) {
          await this.assertCategory(
            tx,
            userId,
            input.categoryId,
            current.type === 'income' ? 'income' : 'expense',
          );
        }
        changes.categoryId = input.categoryId;
      }
      if (input.transactionDate !== undefined) {
        const account = await this.accounts.findOwned(userId, current.accountId, tx);
        this.assertAfterOpening(account, input.transactionDate, 'transactionDate');
        changes.transactionDate = input.transactionDate;
      }
      if (input.amount !== undefined) {
        if (current.accountFxRate !== null || current.baseFxRate !== null) {
          throw new AppError('TRANSACTION_NOT_EDITABLE', [
            {
              path: 'amount',
              message:
                'El monto de un movimiento con cambio de moneda no se edita: elimínalo y regístralo de nuevo.',
            },
          ]);
        }
        const amount = toMoney(input.amount, current.accountCurrency, 'amount').toAmountString();
        Object.assign(changes, { amount, originalAmount: amount, baseAmount: amount });
      }

      const merged: TransactionRow = { ...current, ...changes };
      assertValidLedgerEntry(merged);
      // Un gasto con reembolsos no puede quedar por debajo de lo reembolsado ni después de ellos.
      if (input.amount !== undefined || input.transactionDate !== undefined) {
        const refunds = await tx
          .select()
          .from(transactions)
          .where(and(eq(transactions.refundOfId, id), isNull(transactions.deletedAt)));
        const [first, ...others] = refunds;
        if (first) {
          try {
            assertValidRefund(first, merged, others);
          } catch (error) {
            if (!isDomainError(error) || error.code !== 'INVALID_REFUND') throw error;
            throw error.details.rule === 'before_original'
              ? rule('transactionDate', 'Hay reembolsos anteriores a esa fecha.')
              : rule('amount', 'El monto no puede ser menor que lo ya reembolsado.');
          }
        }
      }

      const updatedRows = await tx
        .update(transactions)
        .set(changes)
        .where(
          isTransferLeg && current.transferGroupId
            ? and(
                eq(transactions.transferGroupId, current.transferGroupId),
                eq(transactions.userId, userId),
                isNull(transactions.deletedAt),
              )
            : and(eq(transactions.id, id), eq(transactions.userId, userId)),
        )
        .returning();
      await this.audit.record(
        {
          action: 'transaction_updated',
          userId,
          entityType: 'transaction',
          entityId: id,
          metadata: { fields: fields.sort().join(',') },
          context: requestContext,
        },
        tx,
      );
      return updatedRows.find((row) => row.id === id) ?? merged;
    });
    const counterparts = await this.counterparts(userId, [updated]);
    return transactionToDto(updated, counterparts.get(updated.id) ?? null);
  }

  /** Borrado lógico. Una transferencia se borra con sus dos patas. */
  async remove(userId: string, id: string, requestContext: RequestContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const current = await this.findOwned(userId, id, tx);
      const [refund] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.refundOfId, id), isNull(transactions.deletedAt)))
        .limit(1);
      if (refund) throw new AppError('TRANSACTION_HAS_REFUNDS');
      const deletedAt = new Date();
      const removed = await tx
        .update(transactions)
        .set({ deletedAt })
        .where(
          current.transferGroupId
            ? and(
                eq(transactions.transferGroupId, current.transferGroupId),
                eq(transactions.userId, userId),
                isNull(transactions.deletedAt),
              )
            : and(eq(transactions.id, id), eq(transactions.userId, userId)),
        )
        .returning({ id: transactions.id });
      for (const row of removed) {
        await this.audit.record(
          {
            action: 'transaction_deleted',
            userId,
            entityType: 'transaction',
            entityId: row.id,
            context: requestContext,
          },
          tx,
        );
      }
    });
  }

  // ---------------------------------------------------------------- apoyo

  private async findOwned(userId: string, id: string, executor: Executor = this.database.db) {
    const [row] = await executor
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  /** Cuenta de la otra pata de cada transferencia o pago del lote. */
  private async counterparts(userId: string, rows: readonly TransactionRow[]) {
    const result = new Map<string, string>();
    const groups = [...new Set(rows.map((row) => row.transferGroupId).filter((g) => g !== null))];
    if (groups.length === 0) return result;
    const legs = await this.database.db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        groupId: transactions.transferGroupId,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.transferGroupId, groups)));
    for (const row of rows) {
      const other = legs.find((leg) => leg.groupId === row.transferGroupId && leg.id !== row.id);
      if (other) result.set(row.id, other.accountId);
    }
    return result;
  }

  private async requireAccount(
    tx: Executor,
    userId: string,
    accountId: string,
    path: string,
  ): Promise<AccountRow> {
    const account = await this.accounts.findOwned(userId, accountId, tx).catch(() => {
      throw invalid(path, 'Elige una de tus cuentas.');
    });
    if (account.status === 'closed') {
      throw new AppError('ACCOUNT_CLOSED', [{ path, message: 'La cuenta está cerrada.' }]);
    }
    return account;
  }

  private assertAfterOpening(account: AccountRow, date: string, path: string): void {
    if (compareLocalDates(date, account.openingBalanceDate) < 0) {
      throw new AppError('TRANSACTION_BEFORE_OPENING_BALANCE', [
        {
          path,
          message: `«${account.name}» empieza el ${account.openingBalanceDate}; lo anterior ya está en su saldo inicial.`,
        },
      ]);
    }
  }

  private async assertCategory(
    tx: Executor,
    userId: string,
    categoryId: string,
    kind: 'income' | 'expense',
  ): Promise<void> {
    const [category] = await tx
      .select({ kind: categories.kind })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          isNull(categories.deletedAt),
          or(isNull(categories.userId), eq(categories.userId, userId)),
        ),
      )
      .limit(1);
    if (!category) throw invalid('categoryId', 'Elige una categoría válida.');
    if (category.kind !== kind) {
      throw invalid(
        'categoryId',
        kind === 'income' ? 'Elige una categoría de ingresos.' : 'Elige una categoría de gastos.',
      );
    }
  }

  /**
   * Montos original/cuenta/base con el motor. Si falta la conversión a la
   * moneda de la cuenta usa la TRM guardada; nunca inventa una tasa.
   */
  private async ledgerAmounts(
    tx: Executor,
    context: FinanceContext,
    params: {
      original: Money;
      account: AccountRow;
      date: string;
      fx?: { accountAmount?: string | undefined; rate?: string | undefined } | undefined;
      fxPath: string;
    },
  ): Promise<LedgerAmounts> {
    const { original, account, date, fx, fxPath } = params;
    const sameCurrency = original.currency === account.currency;
    if (sameCurrency && (fx?.accountAmount !== undefined || fx?.rate !== undefined)) {
      throw invalid(
        fxPath,
        'El monto ya está en la moneda de la cuenta: no hace falta conversión.',
      );
    }

    let accountConversion: AccountConversion | undefined;
    if (!sameCurrency) {
      if (fx?.accountAmount !== undefined) {
        accountConversion = {
          kind: 'settled',
          amount: fx.accountAmount,
          source: SETTLED_FX_SOURCE,
        };
      } else if (fx?.rate !== undefined) {
        accountConversion = {
          kind: 'rate',
          rate: createExchangeRate({
            baseCurrency: original.currency,
            quoteCurrency: account.currency,
            rate: fx.rate,
            rateDate: date,
            source: MANUAL_FX_SOURCE,
          }),
        };
      } else {
        const rate = await this.rates.forConversion(original.currency, account.currency, date, tx);
        if (!rate) {
          throw new AppError('EXCHANGE_RATE_UNAVAILABLE', [
            {
              path: fxPath,
              message: `No hay tasa oficial ${original.currency}/${account.currency} para el ${date}. Escribe el valor cobrado en ${account.currency} o la tasa que aplicó tu banco.`,
            },
          ]);
        }
        accountConversion = { kind: 'rate', rate };
      }
    }

    let baseRate: ExchangeRate | undefined;
    if (original.currency !== context.baseCurrency && account.currency !== context.baseCurrency) {
      baseRate =
        (await this.rates.forConversion(original.currency, context.baseCurrency, date, tx)) ??
        (await this.rates.forConversion(account.currency, context.baseCurrency, date, tx)) ??
        undefined;
      if (!baseRate) {
        throw new AppError('EXCHANGE_RATE_UNAVAILABLE', [
          {
            path: fxPath,
            message: `No hay tasa oficial hacia tu moneda base (${context.baseCurrency}) para el ${date}.`,
          },
        ]);
      }
    }

    try {
      return prepareLedgerAmounts({
        original,
        accountCurrency: account.currency,
        baseCurrency: context.baseCurrency,
        ...(accountConversion ? { accountConversion } : {}),
        ...(baseRate ? { baseRate } : {}),
        convertedAt: context.now,
      });
    } catch (error) {
      if (!isDomainError(error)) throw error;
      switch (error.code) {
        case 'AMOUNT_ROUNDS_TO_ZERO':
          throw rule('amount', 'El monto convertido es demasiado pequeño para registrarse.');
        case 'AMOUNT_OUT_OF_RANGE':
          throw rule('amount', 'El monto convertido supera el máximo permitido.');
        case 'INVALID_RATE':
        case 'RATE_OUT_OF_RANGE':
          throw rule(
            `${fxPath}`,
            'La tasa o el valor cobrado no son válidos para esta conversión.',
          );
        default:
          throw error;
      }
    }
  }

  /** Verifica el movimiento con las reglas del libro antes de escribirlo. */
  private validated(values: NewTransaction): NewTransaction {
    assertValidLedgerEntry(toEntry(values));
    return values;
  }
}

function toMoney(amount: string, currency: string, path: string): Money {
  try {
    return Money.of(amount, currency);
  } catch (error) {
    if (isDomainError(error)) {
      throw invalid(
        path === 'amount' && error.code === 'UNSUPPORTED_CURRENCY' ? 'currency' : path,
        'Monto o moneda no válidos.',
      );
    }
    throw error;
  }
}

function toEntry(values: NewTransaction): LedgerEntry {
  return {
    id: values.id,
    accountId: values.accountId,
    accountCurrency: values.accountCurrency,
    type: values.type,
    direction: values.direction,
    status: values.status ?? 'posted',
    transactionDate: values.transactionDate,
    postedDate: values.postedDate ?? null,
    amount: values.amount,
    originalAmount: values.originalAmount,
    originalCurrency: values.originalCurrency,
    accountFxRate: values.accountFxRate ?? null,
    baseAmount: values.baseAmount,
    baseCurrency: values.baseCurrency,
    baseFxRate: values.baseFxRate ?? null,
    fxSource: values.fxSource ?? null,
    fxConvertedAt: values.fxConvertedAt ?? null,
    categoryId: values.categoryId ?? null,
    transferGroupId: values.transferGroupId ?? null,
    refundOfId: values.refundOfId ?? null,
    deletedAt: null,
  };
}

function refundIssue(ruleName: string): AppError {
  const issues: Record<string, FieldIssue> = {
    exceeds_original: {
      path: 'amount',
      message: 'La suma de reembolsos supera el valor del gasto original.',
    },
    before_original: {
      path: 'transactionDate',
      message: 'El reembolso no puede ser anterior al gasto.',
    },
    original_type: { path: 'refundOfId', message: 'Solo se reembolsan gastos o comisiones.' },
    original_inactive: { path: 'refundOfId', message: 'El gasto original está anulado.' },
  };
  return new AppError('RULE_VIOLATION', [
    issues[ruleName] ?? { path: 'refundOfId', message: 'El reembolso no es válido.' },
  ]);
}

function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify([date, id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      isValidLocalDate(value[0]) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // cae al error de abajo
  }
  throw invalid('cursor', 'El cursor de paginación no es válido.');
}

/** Exportados para pruebas unitarias. */
export const cursorCodec = { encode: encodeCursor, decode: decodeCursor };
