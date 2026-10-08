import { Inject, Injectable } from '@nestjs/common';
import { type Database, type DatabaseHandle, userSettings } from '@cf/db';
import { type LocalDate, localDateInTimeZone } from '@cf/domain';
import { eq } from 'drizzle-orm';
import { AppError } from '../common/errors/app-error.js';
import { DATABASE } from '../database/database.module.js';

export interface FinanceContext {
  userId: string;
  /** Moneda en la que se expresan reportes y flujo de caja. */
  baseCurrency: string;
  timezone: string;
  /** «Hoy» en la zona horaria del usuario: fecha de corte de los saldos. */
  today: LocalDate;
  /** Instante de la petición (para `fx_converted_at`). */
  now: Date;
}

/** Ejecutor de consultas: la base o una transacción en curso. */
export type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

/**
 * Ajustes del usuario que necesitan todos los cálculos financieros. Se leen en
 * cada operación (fuente única: `user_settings`), nunca se copian.
 */
@Injectable()
export class FinanceContextService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async load(userId: string, executor: Executor = this.database.db): Promise<FinanceContext> {
    const [settings] = await executor
      .select({ baseCurrency: userSettings.baseCurrency, timezone: userSettings.timezone })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    if (!settings) throw new AppError('NOT_FOUND', undefined, `Usuario ${userId} sin ajustes`);
    const now = new Date();
    return {
      userId,
      baseCurrency: settings.baseCurrency,
      timezone: settings.timezone,
      today: localDateInTimeZone(now, settings.timezone),
      now,
    };
  }
}
