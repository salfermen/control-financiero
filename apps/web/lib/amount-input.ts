import { Money, formatMoney, isDomainError, parseAmountInput } from '@cf/domain';
import type { Locale } from './format';

export interface AmountPreview {
  /** Texto canónico para la API («25000.5») o `null` si no es válido. */
  readonly value: string | null;
  /** Lo que se va a registrar, ya formateado («$ 25.000»), o el problema. */
  readonly message: string | null;
  readonly valid: boolean;
}

/**
 * Interpreta lo que la persona escribe en un campo de monto y muestra cómo
 * quedará, para que lo confirme antes de guardar (p. ej. «1.250» en es-CO es
 * mil doscientos cincuenta).
 */
export function previewAmount(
  text: string,
  currency: string,
  locale: Locale,
  options: { allowNegative?: boolean } = {},
): AmountPreview {
  if (text.trim() === '') return { value: null, message: null, valid: false };
  try {
    const value = parseAmountInput(text, { locale, allowNegative: options.allowNegative ?? false });
    const money = Money.of(value, currency);
    return {
      value,
      message: `Se registrará: ${formatMoney(money, { locale, decimals: 'exact' })}`,
      valid: true,
    };
  } catch (error) {
    const message =
      isDomainError(error) && error.code === 'TOO_MANY_DECIMALS'
        ? 'Usa máximo 4 decimales.'
        : isDomainError(error) && error.code === 'AMOUNT_OUT_OF_RANGE'
          ? 'El monto es demasiado grande.'
          : 'Escribe solo números, por ejemplo 25.000 o 59,99.';
    return { value: null, message, valid: false };
  }
}

/**
 * Monto de la API («1500.2500») como texto editable en el idioma de la
 * persona («1500,25» en es-CO): sin ceros sobrantes y con su separador decimal.
 */
export function amountToInput(amount: string, locale: Locale): string {
  const trimmed = amount.includes('.') ? amount.replace(/0+$/, '').replace(/\.$/, '') : amount;
  return locale === 'es-CO' ? trimmed.replace('.', ',') : trimmed;
}

/** Interpreta una tasa escrita por la persona (hasta 10 decimales, mayor que cero). */
export function previewRate(text: string, locale: Locale, from: string, to: string): AmountPreview {
  if (text.trim() === '') return { value: null, message: null, valid: false };
  try {
    const value = parseAmountInput(text, { locale });
    if (!/^\d{1,14}(\.\d{1,10})?$/.test(value) || !/[1-9]/.test(value)) {
      return {
        value: null,
        message: 'La tasa debe ser mayor que cero y tener máximo 10 decimales.',
        valid: false,
      };
    }
    return { value, message: `1 ${from} = ${value} ${to}`, valid: true };
  } catch {
    return {
      value: null,
      message: 'Escribe la tasa con números, por ejemplo 4.050,25.',
      valid: false,
    };
  }
}
