import type { LocalDate } from '@cf/domain';

/** Tasa tal como la publica un proveedor, antes de guardarla. */
export interface ProviderRate {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  /** Texto decimal exacto (nunca `number`). */
  readonly rate: string;
  readonly rateDate: LocalDate;
  readonly validUntil: LocalDate | null;
}

/**
 * Contrato de cualquier fuente de tasas. Cada proveedor declara su `source`
 * (se guarda con cada tasa) y lanza errores tipados; nunca devuelve valores
 * inventados ni «por defecto».
 */
export interface ExchangeRateProvider {
  /** Identificador estable que se guarda en `exchange_rates.source`. */
  readonly source: string;
  fetchRates(range: { from: LocalDate; to: LocalDate }): Promise<ProviderRate[]>;
}

export type ProviderFailure = 'unavailable' | 'rate_limited' | 'invalid_response';

/** Fallo del proveedor. El job lo registra y pg-boss reintenta más tarde. */
export class ExchangeRateProviderError extends Error {
  override readonly name = 'ExchangeRateProviderError';

  constructor(
    readonly reason: ProviderFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
