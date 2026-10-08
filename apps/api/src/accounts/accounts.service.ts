import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, accounts, transactions } from '@cf/db';
import { type AccountBalance, Money, computeAccountBalance, compareLocalDates } from '@cf/domain';
import type {
  AccountDto,
  CreateAccountRequest,
  UpdateAccountRequest,
  createAccountRequestSchema,
  updateAccountRequestSchema,
} from '@cf/shared';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { accountToDto } from '../finance/dto.js';
import {
  type Executor,
  type FinanceContext,
  FinanceContextService,
} from '../finance/finance-context.service.js';

export type AccountRow = typeof accounts.$inferSelect;
type CreateInput = z.output<typeof createAccountRequestSchema>;
type UpdateInput = z.output<typeof updateAccountRequestSchema>;

/**
 * Cuentas del usuario. El saldo nunca se guarda: se calcula con el Financial
 * Engine a partir del saldo inicial y del libro (fuente única, §58).
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly finance: FinanceContextService,
    private readonly audit: AuditService,
  ) {}

  /** Cuenta del usuario (no borrada) o 404. Nunca revela cuentas de otros. */
  async findOwned(userId: string, id: string, executor: Executor = this.database.db) {
    const [row] = await executor
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId), isNull(accounts.deletedAt)))
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  async list(userId: string): Promise<AccountDto[]> {
    const context = await this.finance.load(userId);
    const rows = await this.database.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), isNull(accounts.deletedAt)))
      .orderBy(asc(accounts.status), asc(accounts.createdAt));
    if (rows.length === 0) return [];
    const entries = await this.database.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));
    const byAccount = new Map<string, (typeof entries)[number][]>(rows.map((r) => [r.id, []]));
    for (const entry of entries) byAccount.get(entry.accountId)?.push(entry);
    return rows.map((row) =>
      accountToDto(
        row,
        computeAccountBalance(row, byAccount.get(row.id) ?? [], {
          asOf: this.cutoff(row, context),
        }),
      ),
    );
  }

  async get(userId: string, id: string): Promise<AccountDto> {
    const context = await this.finance.load(userId);
    const row = await this.findOwned(userId, id);
    return accountToDto(row, await this.balanceOf(row, context));
  }

  async create(
    userId: string,
    input: CreateInput,
    requestContext: RequestContext,
  ): Promise<AccountDto> {
    // Valida el saldo inicial con el motor (rango y decimales) antes de guardar.
    Money.of(input.openingBalance, input.currency);
    const context = await this.finance.load(userId);
    const row = await this.database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(accounts)
        .values({
          userId,
          name: input.name,
          type: input.type,
          currency: input.currency,
          institutionName: input.institutionName ?? null,
          openingBalance: input.openingBalance,
          openingBalanceDate: input.openingBalanceDate,
          includeInNetWorth: input.includeInNetWorth,
          notes: input.notes ?? null,
        })
        .returning();
      if (!created) throw new AppError('INTERNAL_ERROR', undefined, 'insert sin filas');
      await this.audit.record(
        {
          action: 'account_created',
          userId,
          entityType: 'account',
          entityId: created.id,
          metadata: { type: created.type, currency: created.currency },
          context: requestContext,
        },
        tx,
      );
      return created;
    });
    return accountToDto(row, await this.balanceOf(row, context));
  }

  async update(
    userId: string,
    id: string,
    input: UpdateInput,
    requestContext: RequestContext,
  ): Promise<AccountDto> {
    const context = await this.finance.load(userId);
    const row = await this.database.db.transaction(async (tx) => {
      const current = await this.findOwned(userId, id, tx);
      if (input.openingBalance !== undefined) Money.of(input.openingBalance, current.currency);
      if (
        input.openingBalanceDate !== undefined &&
        compareLocalDates(input.openingBalanceDate, current.openingBalanceDate) > 0
      ) {
        // Mover el saldo inicial hacia adelante dejaría fuera movimientos ya
        // registrados: se exige resolverlos primero.
        const [earlier] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.accountId, id),
              isNull(transactions.deletedAt),
              lt(transactions.transactionDate, input.openingBalanceDate),
            ),
          )
          .limit(1);
        if (earlier) {
          throw new AppError('RULE_VIOLATION', [
            {
              path: 'openingBalanceDate',
              message:
                'Hay movimientos anteriores a esa fecha; el saldo inicial no puede ser posterior a ellos.',
            },
          ]);
        }
      }
      const [updated] = await tx
        .update(accounts)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.institutionName !== undefined
            ? { institutionName: input.institutionName }
            : {}),
          ...(input.openingBalance !== undefined ? { openingBalance: input.openingBalance } : {}),
          ...(input.openingBalanceDate !== undefined
            ? { openingBalanceDate: input.openingBalanceDate }
            : {}),
          ...(input.includeInNetWorth !== undefined
            ? { includeInNetWorth: input.includeInNetWorth }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
        .returning();
      if (!updated) throw new AppError('NOT_FOUND');
      await this.audit.record(
        {
          action: 'account_updated',
          userId,
          entityType: 'account',
          entityId: id,
          metadata: { fields: Object.keys(input).sort().join(',') },
          context: requestContext,
        },
        tx,
      );
      return updated;
    });
    return accountToDto(row, await this.balanceOf(row, context));
  }

  /**
   * Borra una cuenta sin movimientos (borrado lógico). Con historial, se
   * cierra en lugar de borrarse para no perder información.
   */
  async remove(userId: string, id: string, requestContext: RequestContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      await this.findOwned(userId, id, tx);
      const [anyEntry] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.accountId, id), isNull(transactions.deletedAt)))
        .limit(1);
      if (anyEntry) throw new AppError('ACCOUNT_HAS_TRANSACTIONS');
      await tx
        .update(accounts)
        .set({ deletedAt: new Date() })
        .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
      await this.audit.record(
        {
          action: 'account_deleted',
          userId,
          entityType: 'account',
          entityId: id,
          context: requestContext,
        },
        tx,
      );
    });
  }

  private async balanceOf(row: AccountRow, context: FinanceContext): Promise<AccountBalance> {
    const entries = await this.database.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.accountId, row.id), isNull(transactions.deletedAt)));
    return computeAccountBalance(row, entries, { asOf: this.cutoff(row, context) });
  }

  /**
   * Fecha de corte: hoy en la zona del usuario. Si el saldo inicial tiene
   * fecha futura, se usa esa fecha (no hay saldo antes del saldo inicial).
   */
  private cutoff(row: AccountRow, context: FinanceContext): string {
    return compareLocalDates(row.openingBalanceDate, context.today) > 0
      ? row.openingBalanceDate
      : context.today;
  }
}

export type { CreateAccountRequest, UpdateAccountRequest };
