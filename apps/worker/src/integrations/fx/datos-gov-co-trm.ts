import { createExchangeRate, isValidLocalDate } from '@cf/domain';
import { z } from 'zod';
import {
  type ExchangeRateProvider,
  ExchangeRateProviderError,
  type ProviderRate,
} from './provider.js';

/** Conjunto de datos abiertos «Tasa de Cambio Representativa del Mercado - Histórico». */
export const DATOS_GOV_CO_TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json';
export const TRM_SOURCE = 'superfinanciera-trm';

/**
 * Fila del conjunto de datos (API Socrata de datos.gov.co). La TRM la certifica
 * la Superintendencia Financiera de Colombia. `vigenciadesde`/`vigenciahasta`
 * vienen como fecha-hora sin zona («2026-10-07T00:00:00.000»).
 */
const rowSchema = z.object({
  valor: z.union([z.string(), z.number()]),
  unidad: z.string().optional(),
  vigenciadesde: z.string(),
  vigenciahasta: z.string().optional(),
});
const responseSchema = z.array(rowSchema);

export interface DatosGovCoTrmOptions {
  readonly url?: string;
  /** Token de aplicación de Socrata (opcional): sube los límites de uso. */
  readonly appToken?: string | undefined;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Proveedor de la TRM oficial (USD/COP). Solo lectura de datos públicos: no
 * necesita credenciales. Maneja tiempo de espera, límites de uso, errores del
 * servidor y respuestas con forma inesperada (§12, §39).
 */
export class DatosGovCoTrmProvider implements ExchangeRateProvider {
  readonly source = TRM_SOURCE;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DatosGovCoTrmOptions = {}) {
    this.url = options.url ?? DATOS_GOV_CO_TRM_URL;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchRates(range: { from: string; to: string }): Promise<ProviderRate[]> {
    const url = new URL(this.url);
    url.searchParams.set(
      '$where',
      `vigenciadesde >= '${range.from}T00:00:00' AND vigenciadesde <= '${range.to}T23:59:59'`,
    );
    url.searchParams.set('$order', 'vigenciadesde ASC');
    url.searchParams.set('$limit', '5000');

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          accept: 'application/json',
          ...(this.options.appToken ? { 'X-App-Token': this.options.appToken } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ExchangeRateProviderError(
        'unavailable',
        'No se pudo conectar con datos.gov.co (sin red o tiempo de espera agotado).',
        { cause: error },
      );
    }
    if (response.status === 429) {
      throw new ExchangeRateProviderError(
        'rate_limited',
        'datos.gov.co limitó las consultas (429).',
      );
    }
    if (!response.ok) {
      throw new ExchangeRateProviderError(
        'unavailable',
        `datos.gov.co respondió ${response.status}.`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new ExchangeRateProviderError('invalid_response', 'La respuesta no es JSON.', {
        cause: error,
      });
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ExchangeRateProviderError(
        'invalid_response',
        'La respuesta de datos.gov.co no tiene la forma esperada.',
      );
    }
    return parsed.data.map((row) => this.toRate(row));
  }

  private toRate(row: z.infer<typeof rowSchema>): ProviderRate {
    const rateDate = row.vigenciadesde.slice(0, 10);
    const until = row.vigenciahasta?.slice(0, 10) ?? null;
    const unit = row.unidad?.trim().toUpperCase();
    if (unit !== undefined && unit !== 'COP') {
      throw new ExchangeRateProviderError('invalid_response', `Unidad inesperada: ${unit}.`);
    }
    if (!isValidLocalDate(rateDate) || (until !== null && !isValidLocalDate(until))) {
      throw new ExchangeRateProviderError('invalid_response', 'Fecha de vigencia inválida.');
    }
    try {
      // El motor valida la tasa (positiva, ≤ 10 decimales, rango) y la vigencia.
      const rate = createExchangeRate({
        baseCurrency: 'USD',
        quoteCurrency: 'COP',
        rate: String(row.valor).trim(),
        rateDate,
        validUntil: until,
        source: TRM_SOURCE,
      });
      return {
        baseCurrency: rate.baseCurrency,
        quoteCurrency: rate.quoteCurrency,
        rate: rate.rate,
        rateDate: rate.rateDate,
        validUntil: rate.validUntil,
      };
    } catch (error) {
      throw new ExchangeRateProviderError('invalid_response', `TRM inválida para ${rateDate}.`, {
        cause: error,
      });
    }
  }
}
