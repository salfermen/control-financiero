import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, categories, currencies, userSettings } from '@cf/db';
import { SYSTEM_CATEGORIES } from '@cf/domain';
import type { CategoryDto, CurrencyDto } from '@cf/shared';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

const systemNames = new Map(SYSTEM_CATEGORIES.map((c) => [c.key, c] as const));

@Injectable()
export class ReferenceService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async listCurrencies(): Promise<CurrencyDto[]> {
    return this.database.db
      .select({
        code: currencies.code,
        nameEs: currencies.nameEs,
        nameEn: currencies.nameEn,
        minorUnit: currencies.minorUnit,
        displayDecimals: currencies.displayDecimals,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(asc(currencies.code));
  }

  /** Categorías del sistema + las del usuario, con nombres en su idioma. */
  async listCategories(userId: string): Promise<CategoryDto[]> {
    const [settings] = await this.database.db
      .select({ locale: userSettings.locale })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    const english = settings?.locale.startsWith('en') ?? false;

    const rows = await this.database.db
      .select({
        id: categories.id,
        kind: categories.kind,
        name: categories.name,
        parentId: categories.parentId,
        userId: categories.userId,
        systemKey: categories.systemKey,
      })
      .from(categories)
      .where(
        and(
          isNull(categories.deletedAt),
          or(isNull(categories.userId), eq(categories.userId, userId)),
        ),
      )
      .orderBy(asc(categories.kind), asc(categories.name));

    return rows.map((row) => {
      const system = row.systemKey ? systemNames.get(row.systemKey) : undefined;
      return {
        id: row.id,
        kind: row.kind,
        name: system ? (english ? system.nameEn : system.nameEs) : row.name,
        parentId: row.parentId,
        isSystem: row.userId === null,
        systemKey: row.systemKey,
      };
    });
  }
}
