import { addMonths, formatPercent, localDateInTimeZone, monthRange, yearMonthOf } from '@cf/domain';
import {
  accountDtoSchema,
  cashFlowDtoSchema,
  categoryDtoSchema,
  listOf,
  transactionListDtoSchema,
  uuidSchema,
  yearMonthSchema,
} from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, EmptyState, PageHeader, Stat, linkButtonClass } from '@/components/ui';
import { formatMonth, isNegative, isZero, money } from '@/lib/format';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { AccountFilter } from './account-filter';
import { TransactionList } from './transaction-list';

export const metadata: Metadata = { title: 'Movimientos' };
export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cuenta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { settings } = session.user;
  const locale = settings.locale;
  const params = await searchParams;

  const today = localDateInTimeZone(new Date(), settings.timezone);
  const month = yearMonthSchema.safeParse(params.mes).data ?? yearMonthOf(today);
  const accountId = uuidSchema.safeParse(params.cuenta).data;
  const range = monthRange(month);
  const query = new URLSearchParams({ from: range.from, to: range.to, limit: '50' });
  if (accountId) query.set('accountId', accountId);

  const [accounts, categories, flow, list] = await Promise.all([
    serverApi('/accounts', listOf(accountDtoSchema)),
    serverApi('/categories', listOf(categoryDtoSchema)),
    serverApi(`/cash-flow?month=${month}`, cashFlowDtoSchema),
    serverApi(`/transactions?${query.toString()}`, transactionListDtoSchema),
  ]);

  const previous = yearMonthOf(addMonths(range.from, -1));
  const next = yearMonthOf(addMonths(range.from, 1));
  const link = (target: string) =>
    `/movimientos?mes=${target}${accountId ? `&cuenta=${accountId}` : ''}`;
  const hasAccounts = accounts.data.some((a) => a.status === 'active');

  return (
    <>
      <PageHeader
        title="Movimientos"
        action={
          hasAccounts ? (
            <Link
              href={`/movimientos/nuevo${accountId ? `?cuenta=${accountId}` : ''}`}
              className={linkButtonClass.primary}
            >
              Registrar movimiento
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Mes" className="flex items-center gap-2">
          <Link
            href={link(previous)}
            className={linkButtonClass.secondary}
            aria-label="Mes anterior"
          >
            ‹
          </Link>
          <h2 className="min-w-44 text-center text-lg font-semibold first-letter:uppercase">
            {formatMonth(month, locale)}
          </h2>
          <Link href={link(next)} className={linkButtonClass.secondary} aria-label="Mes siguiente">
            ›
          </Link>
        </nav>
        <AccountFilter
          month={month}
          selected={accountId ?? ''}
          accounts={accounts.data.map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Ingresos" value={money(flow.income, locale)} />
          <Stat
            label="Gastos"
            value={money(flow.netExpenses, locale)}
            hint={
              isZero(flow.refunds) && isZero(flow.fees)
                ? undefined
                : `Incluye ${money(flow.fees, locale)} de comisiones y descuenta ${money(flow.refunds, locale)} de reembolsos`
            }
          />
          <Stat
            label="Neto del mes"
            value={money(flow.net, locale)}
            tone={isNegative(flow.net) ? 'negative' : 'positive'}
          />
          <Stat
            label="Ahorro"
            value={
              flow.savingsRate !== null
                ? formatPercent(flow.savingsRate, { locale, decimals: 1 })
                : '—'
            }
            hint="Neto sobre ingresos"
          />
        </dl>
        <p className="mt-3 text-xs text-text-muted">
          Resumen de todas tus cuentas en {flow.baseCurrency}, incluidos los pendientes.
          {flow.excluded.transfer + flow.excluded.payment > 0
            ? ` Las transferencias y pagos entre tus cuentas (${flow.excluded.transfer + flow.excluded.payment}) no cuentan como gasto ni ingreso.`
            : ''}
        </p>
      </Card>

      {!hasAccounts ? (
        <EmptyState
          title="Primero crea una cuenta"
          action={
            <Link href="/cuentas/nueva" className={linkButtonClass.primary}>
              Crear cuenta
            </Link>
          }
        >
          Los movimientos siempre pertenecen a una cuenta (ahorros, efectivo, tarjeta…).
        </EmptyState>
      ) : (
        <TransactionList
          key={`${month}-${accountId ?? 'todas'}`}
          locale={locale}
          initial={list}
          query={query.toString()}
          accounts={accounts.data.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.data.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}
    </>
  );
}
