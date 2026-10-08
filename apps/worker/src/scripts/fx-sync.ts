/**
 * Sincroniza la TRM oficial a demanda (sin esperar al horario del worker).
 *
 *   pnpm fx:sync                                  # últimos 10 días y la anticipada
 *   pnpm fx:sync --from 2024-01-01                # histórico desde una fecha
 *   pnpm fx:sync --from 2024-01-01 --to 2024-12-31
 *
 * Solo guarda lo que publica el proveedor; si no responde, lo dice y termina
 * con error (nunca inventa tasas).
 */
import { createDatabase, loadEnvFromWorkspace } from '@cf/db';
import { addDays, assertLocalDate, compareLocalDates, daysBetween } from '@cf/domain';
import { pino } from 'pino';
import { loadWorkerConfig } from '../config.js';
import { DatosGovCoTrmProvider } from '../integrations/fx/datos-gov-co-trm.js';
import { ExchangeRateProviderError } from '../integrations/fx/provider.js';
import { dailyWindow, syncExchangeRates } from '../jobs/fx-sync.js';

const CHUNK_DAYS = 365;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnvFromWorkspace();
  const config = loadWorkerConfig();
  if (config.FX_TRM_PROVIDER === 'disabled') {
    console.error('FX_TRM_PROVIDER=disabled: la sincronización de la TRM está desactivada.');
    process.exit(1);
  }
  const now = new Date();
  const window = dailyWindow(now, config.WORKER_TIMEZONE);
  const from = assertLocalDate(argument('from') ?? window.from, '--from');
  const to = assertLocalDate(argument('to') ?? window.to, '--to');
  if (compareLocalDates(from, to) > 0) {
    console.error('--from no puede ser posterior a --to.');
    process.exit(1);
  }

  const logger = pino({ level: 'warn' });
  const provider = new DatosGovCoTrmProvider({
    url: config.FX_TRM_URL,
    appToken: config.FX_TRM_APP_TOKEN,
    timeoutMs: config.FX_TRM_TIMEOUT_MS,
  });
  const database = createDatabase(config.DATABASE_URL, {
    maxConnections: 1,
    applicationName: 'cf-fx-sync',
  });
  const totals = { fetched: 0, inserted: 0, unchanged: 0, conflicting: 0 };
  try {
    for (let start = from; compareLocalDates(start, to) <= 0; start = addDays(start, CHUNK_DAYS)) {
      const end = daysBetween(start, to) < CHUNK_DAYS ? to : addDays(start, CHUNK_DAYS - 1);
      const result = await syncExchangeRates({
        db: database.db,
        logger,
        provider,
        from: start,
        to: end,
        now,
      });
      totals.fetched += result.fetched;
      totals.inserted += result.inserted;
      totals.unchanged += result.unchanged;
      totals.conflicting += result.conflicting;
      console.log(`${start} → ${end}: ${result.fetched} publicadas, ${result.inserted} nuevas`);
    }
    console.log(
      `TRM (${provider.source}) del ${from} al ${to}: ${totals.inserted} nuevas, ${totals.unchanged} ya estaban, ${totals.conflicting} con diferencias.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ExchangeRateProviderError) {
    console.error(`No se pudo obtener la TRM: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
