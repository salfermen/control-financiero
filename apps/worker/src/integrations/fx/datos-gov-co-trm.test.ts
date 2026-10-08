import { describe, expect, it } from 'vitest';
import { DATOS_GOV_CO_TRM_URL, DatosGovCoTrmProvider, TRM_SOURCE } from './datos-gov-co-trm.js';
import { ExchangeRateProviderError } from './provider.js';

/**
 * Respuestas SIMULADAS con la forma del conjunto de datos de datos.gov.co.
 * Los valores son ficticios y solo existen en esta prueba.
 */
const SAMPLE = [
  {
    valor: '4000.12',
    unidad: 'COP',
    vigenciadesde: '2026-10-03T00:00:00.000',
    vigenciahasta: '2026-10-05T00:00:00.000',
  },
  {
    valor: 4010.5,
    unidad: 'COP',
    vigenciadesde: '2026-10-06T00:00:00.000',
    vigenciahasta: '2026-10-06T00:00:00.000',
  },
];

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function failure(provider: DatosGovCoTrmProvider) {
  try {
    await provider.fetchRates({ from: '2026-10-01', to: '2026-10-10' });
  } catch (error) {
    expect(error).toBeInstanceOf(ExchangeRateProviderError);
    return (error as ExchangeRateProviderError).reason;
  }
  return 'no_error';
}

describe('DatosGovCoTrmProvider', () => {
  it('consulta el rango y normaliza las tasas con su vigencia', async () => {
    const { impl, calls } = fakeFetch(() => json(SAMPLE));
    const provider = new DatosGovCoTrmProvider({ fetchImpl: impl, appToken: 'token-de-prueba' });
    const rates = await provider.fetchRates({ from: '2026-10-01', to: '2026-10-10' });

    expect(provider.source).toBe(TRM_SOURCE);
    expect(rates).toEqual([
      {
        baseCurrency: 'USD',
        quoteCurrency: 'COP',
        rate: '4000.1200000000',
        rateDate: '2026-10-03',
        validUntil: '2026-10-05',
      },
      {
        baseCurrency: 'USD',
        quoteCurrency: 'COP',
        rate: '4010.5000000000',
        rateDate: '2026-10-06',
        validUntil: '2026-10-06',
      },
    ]);
    const url = new URL(calls[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(DATOS_GOV_CO_TRM_URL);
    expect(url.searchParams.get('$where')).toBe(
      "vigenciadesde >= '2026-10-01T00:00:00' AND vigenciadesde <= '2026-10-10T23:59:59'",
    );
    expect(url.searchParams.get('$order')).toBe('vigenciadesde ASC');
    expect(calls[0]?.headers['X-App-Token']).toBe('token-de-prueba');
  });

  it('sin token no envía la cabecera y acepta filas sin vigencia final', async () => {
    const { impl, calls } = fakeFetch(() =>
      json([{ valor: '4000', vigenciadesde: '2026-10-07T00:00:00.000' }]),
    );
    const rates = await new DatosGovCoTrmProvider({ fetchImpl: impl }).fetchRates({
      from: '2026-10-07',
      to: '2026-10-07',
    });
    expect(rates[0]?.validUntil).toBeNull();
    expect(calls[0]?.headers['X-App-Token']).toBeUndefined();
  });

  it('devuelve lista vacía si no hay publicaciones (no inventa)', async () => {
    const { impl } = fakeFetch(() => json([]));
    expect(
      await new DatosGovCoTrmProvider({ fetchImpl: impl }).fetchRates({
        from: '2026-10-07',
        to: '2026-10-07',
      }),
    ).toEqual([]);
  });

  it.each([
    ['límite de uso', () => json({ message: 'slow down' }, 429), 'rate_limited'],
    ['error del servidor', () => new Response('x', { status: 503 }), 'unavailable'],
    ['respuesta no JSON', () => new Response('<html>', { status: 200 }), 'invalid_response'],
    ['forma inesperada', () => json({ data: [] }), 'invalid_response'],
    [
      'tasa negativa',
      () => json([{ valor: '-1', vigenciadesde: '2026-10-07T00:00:00' }]),
      'invalid_response',
    ],
    [
      'tasa no numérica',
      () => json([{ valor: 'N/A', vigenciadesde: '2026-10-07T00:00:00' }]),
      'invalid_response',
    ],
    [
      'otra unidad',
      () => json([{ valor: '1', unidad: 'USD', vigenciadesde: '2026-10-07T00:00:00' }]),
      'invalid_response',
    ],
    [
      'fecha inválida',
      () => json([{ valor: '4000', vigenciadesde: '2026-02-30T00:00:00' }]),
      'invalid_response',
    ],
    [
      'vigencia invertida',
      () =>
        json([
          {
            valor: '4000',
            vigenciadesde: '2026-10-07T00:00:00',
            vigenciahasta: '2026-10-01T00:00:00',
          },
        ]),
      'invalid_response',
    ],
  ] as const)('%s → %s', async (_name, respond, reason) => {
    const { impl } = fakeFetch(respond);
    expect(await failure(new DatosGovCoTrmProvider({ fetchImpl: impl }))).toBe(reason);
  });

  it('sin red o con tiempo agotado → no disponible', async () => {
    const offline = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    expect(await failure(new DatosGovCoTrmProvider({ fetchImpl: offline }))).toBe('unavailable');

    const slow = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('abortado')));
      })) as typeof fetch;
    expect(await failure(new DatosGovCoTrmProvider({ fetchImpl: slow, timeoutMs: 1000 }))).toBe(
      'unavailable',
    );
  });
});
