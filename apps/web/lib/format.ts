import {
  type AccountType,
  Money,
  formatMoney,
  parseLocalDate,
  type TransactionType,
} from '@cf/domain';
import type { MoneyDto } from '@cf/shared';

/**
 * Presentación de datos financieros en la web. Todo redondeo y formato de
 * dinero lo hace el Financial Engine (`formatMoney`); aquí solo se elige el
 * idioma y los textos.
 */

export type Locale = 'es-CO' | 'en-US';

export function money(dto: MoneyDto, locale: Locale = 'es-CO'): string {
  return formatMoney(Money.of(dto.amount, dto.currency), { locale });
}

/** Valor absoluto formateado («te pasaste por $ 12.000» a partir de −12.000). */
export function absMoney(dto: MoneyDto, locale: Locale = 'es-CO'): string {
  return formatMoney(Money.of(dto.amount, dto.currency).abs(), { locale });
}

/** Monto con signo según el sentido del movimiento: «−$ 25.000» o «+$ 2.900.000». */
export function signedMoney(
  dto: MoneyDto,
  direction: 'inflow' | 'outflow',
  locale: Locale = 'es-CO',
) {
  const text = money(dto, locale);
  return direction === 'outflow' ? `−${text}` : `+${text}`;
}

export function isNegative(dto: MoneyDto): boolean {
  return Money.of(dto.amount, dto.currency).isNegative();
}

export function isZero(dto: MoneyDto): boolean {
  return Money.of(dto.amount, dto.currency).isZero();
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Fecha contable «2026-10-07» → «7 oct 2026». Se formatea en UTC a partir de
 * las partes de la fecha: nunca se corre un día por la zona horaria.
 */
export function formatDate(
  date: string,
  locale: Locale = 'es-CO',
  style: 'short' | 'long' = 'short',
): string {
  const { year, month, day } = parseLocalDate(date);
  const key = `${locale}|${style}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: style === 'long' ? 'long' : 'short',
      year: 'numeric',
      ...(style === 'long' ? { weekday: 'long' as const } : {}),
    });
    dateFormatters.set(key, formatter);
  }
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return formatter.format(utc);
}

/** «2026-10» → «octubre de 2026». */
export function formatMonth(yearMonth: string, locale: Locale = 'es-CO'): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year ?? 1970, (month ?? 1) - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(utc);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorros',
  cash: 'Efectivo',
  digital_wallet: 'Billetera digital',
  investment: 'Inversión',
  credit_card: 'Tarjeta de crédito',
  loan: 'Préstamo',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
  refund: 'Reembolso',
  payment: 'Pago',
  fee: 'Comisión',
  investment: 'Inversión',
};

export const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  debit_card: 'Tarjeta débito',
  credit_card: 'Tarjeta de crédito',
  bank_transfer: 'Transferencia',
  digital_wallet: 'Billetera digital',
  other: 'Otro',
} as const;
