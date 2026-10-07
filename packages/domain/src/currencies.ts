/**
 * Registro de monedas soportadas.
 *
 * Fuente: ISO 4217 (código alfabético y número de decimales oficiales).
 * `displayDecimals` es una decisión de producto, no de ISO: el peso colombiano
 * tiene 2 decimales oficiales pero en la práctica no usa centavos, así que se
 * muestra sin decimales. Los cálculos NUNCA usan `displayDecimals`; se guarda
 * con 4 decimales y se redondea solo al presentar (decisión A3 de la auditoría).
 */
export interface CurrencyDefinition {
  /** Código ISO 4217 de tres letras mayúsculas. */
  readonly code: string;
  readonly nameEs: string;
  readonly nameEn: string;
  /** Decimales oficiales según ISO 4217. */
  readonly minorUnit: number;
  /** Decimales que se muestran al usuario. */
  readonly displayDecimals: number;
}

export const BASE_CURRENCY_DEFAULT = 'COP';

export const CURRENCIES: readonly CurrencyDefinition[] = [
  {
    code: 'COP',
    nameEs: 'Peso colombiano',
    nameEn: 'Colombian peso',
    minorUnit: 2,
    displayDecimals: 0,
  },
  {
    code: 'USD',
    nameEs: 'Dólar estadounidense',
    nameEn: 'US dollar',
    minorUnit: 2,
    displayDecimals: 2,
  },
  { code: 'EUR', nameEs: 'Euro', nameEn: 'Euro', minorUnit: 2, displayDecimals: 2 },
  {
    code: 'GBP',
    nameEs: 'Libra esterlina',
    nameEn: 'Pound sterling',
    minorUnit: 2,
    displayDecimals: 2,
  },
  { code: 'JPY', nameEs: 'Yen japonés', nameEn: 'Japanese yen', minorUnit: 0, displayDecimals: 0 },
  {
    code: 'CAD',
    nameEs: 'Dólar canadiense',
    nameEn: 'Canadian dollar',
    minorUnit: 2,
    displayDecimals: 2,
  },
  {
    code: 'AUD',
    nameEs: 'Dólar australiano',
    nameEn: 'Australian dollar',
    minorUnit: 2,
    displayDecimals: 2,
  },
  {
    code: 'BRL',
    nameEs: 'Real brasileño',
    nameEn: 'Brazilian real',
    minorUnit: 2,
    displayDecimals: 2,
  },
  {
    code: 'MXN',
    nameEs: 'Peso mexicano',
    nameEn: 'Mexican peso',
    minorUnit: 2,
    displayDecimals: 2,
  },
  { code: 'CHF', nameEs: 'Franco suizo', nameEn: 'Swiss franc', minorUnit: 2, displayDecimals: 2 },
  { code: 'CNY', nameEs: 'Yuan chino', nameEn: 'Chinese yuan', minorUnit: 2, displayDecimals: 2 },
  { code: 'CLP', nameEs: 'Peso chileno', nameEn: 'Chilean peso', minorUnit: 0, displayDecimals: 0 },
  { code: 'PEN', nameEs: 'Sol peruano', nameEn: 'Peruvian sol', minorUnit: 2, displayDecimals: 2 },
  {
    code: 'ARS',
    nameEs: 'Peso argentino',
    nameEn: 'Argentine peso',
    minorUnit: 2,
    displayDecimals: 2,
  },
] as const;

export const CURRENCY_CODES: readonly string[] = CURRENCIES.map((c) => c.code);

const byCode = new Map(CURRENCIES.map((c) => [c.code, c] as const));

export function isSupportedCurrency(code: string): boolean {
  return byCode.has(code);
}

/** Devuelve la definición o lanza si la moneda no está soportada. */
export function getCurrency(code: string): CurrencyDefinition {
  const currency = byCode.get(code);
  if (!currency) {
    throw new RangeError(`Moneda no soportada: ${code}`);
  }
  return currency;
}
