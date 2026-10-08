import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, currencies } from '@cf/db';
import type { CurrencyDto } from '@cf/shared';
import { asc, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

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
}
