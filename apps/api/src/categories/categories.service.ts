import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, budgets, categories, transactions, userSettings } from '@cf/db';
import { type CategoryNode, SYSTEM_CATEGORIES, startOfMonth } from '@cf/domain';
import type {
  CategoryDto,
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
} from '@cf/shared';
import { and, count, eq, gte, isNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { type Executor, FinanceContextService } from '../finance/finance-context.service.js';

type CreateInput = z.output<typeof createCategoryRequestSchema>;
type UpdateInput = z.output<typeof updateCategoryRequestSchema>;
type CategoryRow = typeof categories.$inferSelect;

const systemNames = new Map(SYSTEM_CATEGORIES.map((c) => [c.key, c] as const));

const invalid = (path: string, message: string): AppError =>
  new AppError('VALIDATION_ERROR', [{ path, message }]);

/** Comparación de nombres sin distinguir mayúsculas, tildes ni espacios extremos. */
function normalizeName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } }).cause ?? error;
  return (cause as { code?: unknown }).code === '23505';
}

/** Categoría visible para el usuario con su nombre ya traducido. */
export interface VisibleCategory {
  readonly id: string;
  readonly kind: 'income' | 'expense';
  readonly name: string;
  readonly parentId: string | null;
  readonly isSystem: boolean;
  readonly systemKey: string | null;
  readonly deleted: boolean;
}

/**
 * Categorías del sistema y personalizadas. Las del sistema son de solo
 * lectura; las del usuario se crean, renombran, reubican y eliminan (borrado
 * lógico, con la opción de mover antes sus movimientos a otra categoría).
 */
@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly finance: FinanceContextService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<CategoryDto[]> {
    const all = await this.all(userId);
    return all
      .filter((category) => !category.deleted)
      .sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) ||
          a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      )
      .map((category) => ({
        id: category.id,
        kind: category.kind,
        name: category.name,
        parentId: category.parentId,
        isSystem: category.isSystem,
        systemKey: category.systemKey,
      }));
  }

  /**
   * Todas las categorías del usuario y del sistema, incluidas las eliminadas
   * (los presupuestos y movimientos antiguos pueden seguir apuntándolas).
   */
  async all(userId: string, executor: Executor = this.database.db): Promise<VisibleCategory[]> {
    const english = await this.prefersEnglish(userId, executor);
    const rows = await executor
      .select()
      .from(categories)
      .where(or(isNull(categories.userId), eq(categories.userId, userId)));
    return rows.map((row) => this.toVisible(row, english));
  }

  /** Árbol para el Financial Engine (presupuestos con subcategorías). */
  static toNodes(all: readonly VisibleCategory[]): CategoryNode[] {
    return all.map((c) => ({ id: c.id, parentId: c.parentId, kind: c.kind }));
  }

  async create(userId: string, input: CreateInput, context: RequestContext): Promise<CategoryDto> {
    const created = await this.database.db.transaction(async (tx) => {
      const all = await this.all(userId, tx);
      this.assertNameAvailable(all, input.kind, input.name, null);
      if (input.parentId !== null) this.assertValidParent(all, input.parentId, input.kind, null);
      let row: CategoryRow | undefined;
      try {
        [row] = await tx
          .insert(categories)
          .values({ userId, kind: input.kind, name: input.name, parentId: input.parentId })
          .returning();
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError('CATEGORY_NAME_TAKEN');
        throw error;
      }
      if (!row) throw new AppError('INTERNAL_ERROR', undefined, 'insert sin filas');
      await this.audit.record(
        {
          action: 'category_created',
          userId,
          entityType: 'category',
          entityId: row.id,
          metadata: { kind: row.kind, subcategory: row.parentId !== null },
          context,
        },
        tx,
      );
      return row;
    });
    return this.toDto(this.toVisible(created, false));
  }

  async update(
    userId: string,
    id: string,
    input: UpdateInput,
    context: RequestContext,
  ): Promise<CategoryDto> {
    const updated = await this.database.db.transaction(async (tx) => {
      const all = await this.all(userId, tx);
      const current = this.findEditable(all, id);
      if (input.name !== undefined) this.assertNameAvailable(all, current.kind, input.name, id);
      if (input.parentId !== undefined && input.parentId !== null) {
        this.assertValidParent(all, input.parentId, current.kind, id);
        if (all.some((c) => !c.deleted && c.parentId === id)) {
          throw new AppError('RULE_VIOLATION', [
            {
              path: 'parentId',
              message:
                'Esta categoría tiene subcategorías; no puede ser a su vez subcategoría (máximo dos niveles).',
            },
          ]);
        }
      }
      let row: CategoryRow | undefined;
      try {
        [row] = await tx
          .update(categories)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          })
          .where(and(eq(categories.id, id), eq(categories.userId, userId)))
          .returning();
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError('CATEGORY_NAME_TAKEN');
        throw error;
      }
      if (!row) throw new AppError('NOT_FOUND');
      await this.audit.record(
        {
          action: 'category_updated',
          userId,
          entityType: 'category',
          entityId: id,
          metadata: { fields: Object.keys(input).sort().join(',') },
          context,
        },
        tx,
      );
      return row;
    });
    return this.toDto(this.toVisible(updated, false));
  }

  /**
   * Elimina (lógicamente) una categoría propia. Con movimientos exige
   * `moveTo`: se reasignan a esa categoría en la misma transacción. Con
   * subcategorías o presupuestos vigentes desde este mes, se rechaza.
   */
  async remove(
    userId: string,
    id: string,
    moveTo: string | undefined,
    context: RequestContext,
  ): Promise<void> {
    const financeContext = await this.finance.load(userId);
    await this.database.db.transaction(async (tx) => {
      const all = await this.all(userId, tx);
      const current = this.findEditable(all, id);

      if (all.some((c) => !c.deleted && c.parentId === id)) {
        throw new AppError('CATEGORY_IN_USE', [
          { path: 'id', message: 'Tiene subcategorías: elimínalas o muévelas primero.' },
        ]);
      }
      const [activeBudget] = await tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(
          and(
            eq(budgets.userId, userId),
            eq(budgets.categoryId, id),
            isNull(budgets.deletedAt),
            or(isNull(budgets.validTo), gte(budgets.validTo, startOfMonth(financeContext.today))),
          ),
        )
        .limit(1);
      if (activeBudget) {
        throw new AppError('CATEGORY_IN_USE', [
          { path: 'id', message: 'Tiene un presupuesto vigente: quítalo primero.' },
        ]);
      }

      const usage = and(
        eq(transactions.userId, userId),
        eq(transactions.categoryId, id),
        isNull(transactions.deletedAt),
      );
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(transactions)
        .where(usage);
      let moved = 0;
      if (total > 0) {
        if (moveTo === undefined) {
          throw new AppError('CATEGORY_IN_USE', [
            {
              path: 'moveTo',
              message: `Tiene ${total} movimiento(s): elige a qué categoría moverlos.`,
            },
          ]);
        }
        const target = all.find((c) => c.id === moveTo && !c.deleted);
        if (!target || target.id === id) {
          throw invalid('moveTo', 'Elige otra categoría válida para mover los movimientos.');
        }
        if (target.kind !== current.kind) {
          throw invalid(
            'moveTo',
            'Los movimientos solo pueden moverse a una categoría del mismo tipo.',
          );
        }
        const result = await tx
          .update(transactions)
          .set({ categoryId: moveTo })
          .where(usage)
          .returning({ id: transactions.id });
        moved = result.length;
      }

      await tx
        .update(categories)
        .set({ deletedAt: financeContext.now })
        .where(and(eq(categories.id, id), eq(categories.userId, userId)));
      await this.audit.record(
        {
          action: 'category_deleted',
          userId,
          entityType: 'category',
          entityId: id,
          metadata: { movedTransactions: moved, moveTo: moved > 0 ? (moveTo ?? null) : null },
          context,
        },
        tx,
      );
    });
  }

  private async prefersEnglish(userId: string, executor: Executor): Promise<boolean> {
    const [settings] = await executor
      .select({ locale: userSettings.locale })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return settings?.locale.startsWith('en') ?? false;
  }

  private toVisible(row: CategoryRow, english: boolean): VisibleCategory {
    const system = row.systemKey ? systemNames.get(row.systemKey) : undefined;
    return {
      id: row.id,
      kind: row.kind,
      name: system ? (english ? system.nameEn : system.nameEs) : row.name,
      parentId: row.parentId,
      isSystem: row.userId === null,
      systemKey: row.systemKey,
      deleted: row.deletedAt !== null,
    };
  }

  private toDto(category: VisibleCategory): CategoryDto {
    return {
      id: category.id,
      kind: category.kind,
      name: category.name,
      parentId: category.parentId,
      isSystem: category.isSystem,
      systemKey: category.systemKey,
    };
  }

  /** Categoría propia, no eliminada. Las del sistema se ven pero no se editan. */
  private findEditable(all: readonly VisibleCategory[], id: string): VisibleCategory {
    const category = all.find((c) => c.id === id && !c.deleted);
    if (!category) throw new AppError('NOT_FOUND');
    if (category.isSystem) {
      throw new AppError('FORBIDDEN', [
        { path: 'id', message: 'Las categorías del sistema no se pueden modificar.' },
      ]);
    }
    return category;
  }

  private assertNameAvailable(
    all: readonly VisibleCategory[],
    kind: 'income' | 'expense',
    name: string,
    exceptId: string | null,
  ): void {
    const wanted = normalizeName(name);
    const taken = all.some((c) => {
      if (c.deleted || c.kind !== kind || c.id === exceptId) return false;
      if (normalizeName(c.name) === wanted) return true;
      // Las del sistema también se comparan en el otro idioma.
      const system = c.systemKey ? systemNames.get(c.systemKey) : undefined;
      return (
        system !== undefined &&
        (normalizeName(system.nameEs) === wanted || normalizeName(system.nameEn) === wanted)
      );
    });
    if (taken)
      throw new AppError('CATEGORY_NAME_TAKEN', [
        { path: 'name', message: 'Ese nombre ya existe.' },
      ]);
  }

  private assertValidParent(
    all: readonly VisibleCategory[],
    parentId: string,
    kind: 'income' | 'expense',
    selfId: string | null,
  ): void {
    const parent = all.find((c) => c.id === parentId && !c.deleted);
    if (!parent || parent.id === selfId) {
      throw invalid('parentId', 'Elige una categoría principal válida.');
    }
    if (parent.kind !== kind) {
      throw invalid(
        'parentId',
        'La categoría principal debe ser del mismo tipo (ingreso o gasto).',
      );
    }
    if (parent.parentId !== null) {
      throw invalid(
        'parentId',
        'Elige una categoría principal: las subcategorías no pueden tener subcategorías.',
      );
    }
  }
}
