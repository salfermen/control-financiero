import { getCurrency } from '../currencies.js';
import type { Money } from './money.js';

export interface FormatMoneyOptions {
  /** Idioma y región BCP 47. Por defecto `es-CO`. */
  readonly locale?: string;
  /** Cómo mostrar la moneda: símbolo (`$`), código (`COP`) o símbolo corto. */
  readonly currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code';
  /**
   * Decimales a mostrar. `display` (por defecto) usa los de la moneda (COP 0,
   * USD 2); `storage` muestra los 4 guardados (útil en detalles técnicos).
   */
  readonly decimals?: 'display' | 'storage';
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
  const decimals = options.decimals === 'storage' ? 4 : getCurrency(money.currency).displayDecimals;
  const rounded = options.decimals === 'storage' ? money : money.round(decimals, 'half_up');
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
