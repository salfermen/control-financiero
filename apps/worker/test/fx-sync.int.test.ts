import { exchangeRates } from '@cf/db';
import { createTestDatabase, resetTestDatabase } from '@cf/db/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExchangeRateProvider, ProviderRate } from '../src/integrations/fx/provider.js';
import { syncExchangeRates } from '../src/jobs/fx-sync.js';

/** Proveedor de PRUEBA: devuelve exactamente las tasas que se le indiquen. */
function fakeProvider(rates: ProviderRate[]): ExchangeRateProvider {
  return { source: 'test-provider', fetchRates: () => Promise.resolve(rates) };
}

const rate = (rateDate: string, value: string, validUntil: string | null = null): ProviderRate => ({
  baseCurrency: 'USD',
  quoteCurrency: 'COP',
  rate: value,
  rateDate,
  validUntil,
});

const logger = pino({ level: 'silent' });
let handle: ReturnType<typeof createTestDatabase>;

beforeAll(async () => {
  await resetTestDatabase();
  handle = createTestDatabase();
});
afterAll(async () => {
  await handle.close();
});

describe('sincronización de tasas', () => {
  const params = { from: '2026-10-01', to: '2026-10-10', now: new Date('2026-10-07T20:00:00Z') };

  it('guarda las nuevas, reconoce las repetidas y nunca sobrescribe el histórico', async () => {
    const first = await syncExchangeRates({
      db: handle.db,
      logger,
      provider: fakeProvider([
        rate('2026-10-03', '4000.1200000000', '2026-10-05'),
        rate('2026-10-06', '4010.0000000000'),
      ]),
      ...params,
    });
    expect(first).toMatchObject({ fetched: 2, inserted: 2, unchanged: 0, conflicting: 0 });

    const second = await syncExchangeRates({
      db: handle.db,
      logger,
      provider: fakeProvider([
        rate('2026-10-06', '4010.0000000000'),
        rate('2026-10-07', '4020.0000000000'),
      ]),
      ...params,
    });
    expect(second).toMatchObject({ fetched: 2, inserted: 1, unchanged: 1, conflicting: 0 });

    const corrected = await syncExchangeRates({
      db: handle.db,
      logger,
      provider: fakeProvider([rate('2026-10-07', '4999.0000000000')]),
      ...params,
    });
    expect(corrected).toMatchObject({ inserted: 0, conflicting: 1 });

    const stored = await handle.db.select().from(exchangeRates);
    expect(stored.map((r) => [r.rateDate, r.rate, r.validUntil, r.source]).sort()).toEqual([
      ['2026-10-03', '4000.1200000000', '2026-10-05', 'test-provider'],
      ['2026-10-06', '4010.0000000000', null, 'test-provider'],
      ['2026-10-07', '4020.0000000000', null, 'test-provider'],
    ]);
  });

  it('sin publicaciones no escribe nada', async () => {
    const result = await syncExchangeRates({
      db: handle.db,
      logger,
      provider: fakeProvider([]),
      ...params,
    });
    expect(result).toMatchObject({ fetched: 0, inserted: 0 });
  });
});
