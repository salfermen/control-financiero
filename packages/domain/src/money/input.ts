import { DomainError } from '../errors.js';

export interface ParseAmountOptions {
  /**
   * Convención para los casos ambiguos (un solo separador seguido de 3 cifras):
   * en `es-CO` «1.250» es mil doscientos cincuenta; en `en-US` es 1,25.
   */
  readonly locale?: 'es-CO' | 'en-US';
  readonly allowNegative?: boolean;
}

const THOUSANDS_GROUPS = (separator: string) => new RegExp(`^\\d{1,3}(?:\\${separator}\\d{3})+$`);

/**
 * Convierte lo que una persona escribe en un campo de monto («25.000»,
 * «1.250.000,50», «59.99», «$ 2.900.000») en texto decimal canónico
 * («25000», «1250000.50», «59.99», «2900000») para enviarlo a la API.
 *
 * Reglas:
 * - Se ignoran espacios y el símbolo `$`.
 * - Con punto y coma a la vez, el último separador es el decimal.
 * - Un separador repetido es de miles y debe agrupar de a 3 cifras.
 * - Un único separador seguido de exactamente 3 cifras es ambiguo y se
 *   resuelve según `locale`; en otro caso es el decimal.
 *
 * No calcula nada: solo normaliza. La UI debe mostrar el valor interpretado
 * (con `formatMoney`) para que la persona confirme antes de guardar.
 */
export function parseAmountInput(input: string, options: ParseAmountOptions = {}): string {
  const locale = options.locale ?? 'es-CO';
  const invalid = (): never => {
    throw new DomainError('INVALID_NUMBER', 'El monto no tiene un formato válido.', {
      received: typeof input === 'string' ? input.slice(0, 32) : typeof input,
    });
  };
  if (typeof input !== 'string' || input.length > 64) invalid();

  let text = input.replace(/[\s\u00a0\u202f$]/g, '');
  let negative = false;
  if (text.startsWith('-')) {
    if (!options.allowNegative) invalid();
    negative = true;
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) invalid();

  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  let integerPart = text;
  let fraction = '';

  if (dots > 0 && commas > 0) {
    const decimalSeparator = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    const index = text.lastIndexOf(decimalSeparator);
    integerPart = text.slice(0, index);
    fraction = text.slice(index + 1);
    if (
      integerPart.includes(decimalSeparator) ||
      !THOUSANDS_GROUPS(thousandsSeparator).test(integerPart)
    ) {
      invalid();
    }
    integerPart = integerPart.split(thousandsSeparator).join('');
  } else if (dots + commas > 0) {
    const separator = dots > 0 ? '.' : ',';
    const count = dots + commas;
    const [head = '', tail = ''] = text.split(separator);
    const ambiguous = count === 1 && tail.length === 3 && head.length >= 1 && head.length <= 3;
    const isThousands =
      count > 1 || (ambiguous && (locale === 'es-CO' ? separator === '.' : separator === ','));
    if (isThousands) {
      if (!THOUSANDS_GROUPS(separator).test(text)) invalid();
      integerPart = text.split(separator).join('');
    } else {
      integerPart = head;
      fraction = tail;
    }
  }

  if (!/^\d+$/.test(integerPart) || (fraction !== '' && !/^\d+$/.test(fraction))) invalid();
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '');
  const result = fraction === '' ? normalizedInteger : `${normalizedInteger}.${fraction}`;
  return negative && /[1-9]/.test(result) ? `-${result}` : result;
}
