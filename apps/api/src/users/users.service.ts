import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, budgets, transactions, userSettings, users } from '@cf/db';
import type { UpdateSettingsRequest, UserDto } from '@cf/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

type SettingsChanges = Omit<UpdateSettingsRequest, never>;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  async getUserDto(userId: string): Promise<UserDto> {
    const [row] = await this.database.db
      .select({ user: users, settings: userSettings })
      .from(users)
      .innerJoin(userSettings, eq(userSettings.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND', undefined, `Usuario ${userId} sin perfil`);
    return {
      id: row.user.id,
      email: row.user.email,
      displayName: row.user.displayName,
      createdAt: row.user.createdAt.toISOString(),
      settings: {
        baseCurrency: row.settings.baseCurrency,
        locale: row.settings.locale as UserDto['settings']['locale'],
        timezone: row.settings.timezone,
        theme: row.settings.theme,
      },
    };
  }

  async updateSettings(
    userId: string,
    changes: SettingsChanges,
    context: RequestContext,
  ): Promise<UserDto> {
    await this.database.db.transaction(async (tx) => {
      if (changes.baseCurrency !== undefined) {
        const [current] = await tx
          .select({ baseCurrency: userSettings.baseCurrency })
          .from(userSettings)
          .where(eq(userSettings.userId, userId))
          .for('update');
        if (current && current.baseCurrency !== changes.baseCurrency) {
          // Cambiar la moneda base con movimientos existentes dejaría sus montos
          // base inconsistentes. Se bloquea hasta tener una migración explícita.
          const [existing] = await tx
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.userId, userId))
            .limit(1);
          // Los límites de presupuesto también están en la moneda base.
          const [budget] = await tx
            .select({ id: budgets.id })
            .from(budgets)
            .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)))
            .limit(1);
          if (existing || budget) throw new AppError('BASE_CURRENCY_LOCKED');
        }
      }

      await tx.update(userSettings).set(changes).where(eq(userSettings.userId, userId));
      await this.audit.record(
        {
          action: 'settings_updated',
          userId,
          entityType: 'user_settings',
          entityId: userId,
          metadata: { fields: Object.keys(changes).sort().join(',') },
          context,
        },
        tx,
      );
    });
    return this.getUserDto(userId);
  }
}
