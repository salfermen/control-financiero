import type { ExchangeRateProvider } from '../integrations/fx/provider.js';
import { dailyWindow, syncExchangeRates } from './fx-sync.js';
import type { ScheduledJob } from './registry.js';

export const FX_TRM_SYNC_JOB = 'fx.trm-sync';

/**
 * Sincroniza la TRM oficial varias veces al día (la Superintendencia la
 * publica en la tarde del día hábil anterior). Al arrancar también se ejecuta,
 * para no esperar al siguiente horario.
 */
export function fxTrmSyncJob(provider: ExchangeRateProvider, timeZone: string): ScheduledJob {
  return {
    name: FX_TRM_SYNC_JOB,
    cron: '23 8,13,18 * * *',
    description: 'Trae la TRM oficial (USD/COP) de los últimos 10 días y la anticipada.',
    runOnStart: true,
    async run({ db, logger, now }) {
      const current = now();
      const result = await syncExchangeRates({
        db,
        logger,
        provider,
        ...dailyWindow(current, timeZone),
        now: current,
      });
      logger.info({ job: FX_TRM_SYNC_JOB, ...result }, 'TRM sincronizada');
      return result;
    },
  };
}
