import { getCurrency } from '../currencies.js';
import { parseDecimal, roundToScale } from './decimal.js';
import type { Money } from './money.js';

export interface FormatMoneyOptions {
  /** Idioma y región BCP 47. Por defecto `es-CO`. */
  readonly locale?: string;
  /** Cómo mostrar la moneda: símbolo (`$`), código (`COP`) o símbolo corto. */
  readonly currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code';
  /**
   * Decimales a mostrar. `display` (por defecto) usa los de la moneda (COP 0,
   * USD 2); `storage` muestra los 4 guardados (útil en detalles técnicos);
   * `exact` muestra los de la moneda o más si el monto los tiene (sin
   * redondear: útil para confirmar lo que la persona escribió).
   */
  readonly decimals?: 'display' | 'storage' | 'exact';
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formatea un monto para la interfaz. Es el único lugar donde se redondea para
 * mostrar: las pantallas no deben redondear ni formatear dinero por su cuenta.
 *
 * El redondeo (half_up) se hace con aritmética decimal y luego Intl solo pone
 * separadores y símbolo; Intl recibe texto, no `number`, así que no hay
 * pérdida de precisión ni siquiera con montos de 16 cifras.
 */
export function formatMoney(money: Money, options: FormatMoneyOptions = {}): string {
  const locale = options.locale ?? 'es-CO';
  const currencyDisplay = options.currencyDisplay ?? 'symbol';
  const displayDecimals = getCurrency(money.currency).displayDecimals;
  const decimals =
    options.decimals === 'storage'
      ? 4
      : options.decimals === 'exact'
        ? Math.max(displayDecimals, money.toDecimal().decimalPlaces())
        : displayDecimals;
  const rounded =
    options.decimals === 'display' || !options.decimals ? money.round(decimals, 'half_up') : money;
  return getFormatter(locale, money.currency, currencyDisplay, decimals).format(
    rounded.toAmountString() as Intl.StringNumericLiteral,
  );
}

function getFormatter(
  locale: string,
  currency: string,
  currencyDisplay: NonNullable<FormatMoneyOptions['currencyDisplay']>,
  decimals: number,
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${currencyDisplay}|${decimals}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

const percentFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formatea una proporción decimal («0.0125») como porcentaje («1,25 %»),
 * redondeando half_up a `decimals` cifras del porcentaje.
 */
export function formatPercent(
  ratio: string,
  options: { readonly locale?: string; readonly decimals?: number; readonly signed?: boolean } = {},
): string {
  const locale = options.locale ?? 'es-CO';
  const decimals = options.decimals ?? 2;
  const value = roundToScale(
    parseDecimal(ratio, 'INVALID_NUMBER', 'proporción'),
    decimals + 2,
    'half_up',
  );
  const key = `${locale}|${decimals}|${options.signed ? 's' : ''}`;
  let formatter = percentFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...(options.signed ? { signDisplay: 'exceptZero' as const } : {}),
    });
    percentFormatters.set(key, formatter);
  }
  return formatter.format(value.toFixed(decimals + 2) as Intl.StringNumericLiteral);
}

/**
 * Formatea una tasa («4050.1200000000» COP por USD) como precio en la moneda
 * cotizada con 2 decimales («$ 4.050,12»). Solo presentación.
 */
export function formatRate(
  rate: string,
  quoteCurrency: string,
  options: { readonly locale?: string } = {},
): string {
  const value = roundToScale(parseDecimal(rate, 'INVALID_RATE', 'tasa'), 2, 'half_up');
  return getFormatter(options.locale ?? 'es-CO', quoteCurrency, 'symbol', 2).format(
    value.toFixed(2) as Intl.StringNumericLiteral,
  );
}
