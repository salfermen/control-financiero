import { formatPercent, formatRate } from '@cf/domain';
import {
  accountDtoSchema,
  cashFlowDtoSchema,
  exchangeRateLookupDtoSchema,
  listOf,
} from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, EmptyState, Notice, PageHeader, Stat, linkButtonClass } from '@/components/ui';
import { ACCOUNT_TYPE_LABELS, formatDate, formatMonth, isNegative, money } from '@/lib/format';
import { rateSourceLabel } from '@/lib/labels';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';

export const metadata: Metadata = { title: 'Inicio' };
export const dynamic = 'force-dynamic';

/**
 * Inicio: solo datos reales del usuario (cuentas, flujo del mes) y la TRM
 * guardada con su fuente. Sin datos, lo dice; nunca muestra cifras de ejemplo.
 */
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { user } = session;
  const locale = user.settings.locale;

  const [accounts, flow, trm] = await Promise.all([
    serverApi('/accounts', listOf(accountDtoSchema)),
    serverApi('/cash-flow', cashFlowDtoSchema),
    serverApi('/exchange-rates/current?base=USD&quote=COP', exchangeRateLookupDtoSchema),
  ]);
  const active = accounts.data.filter((account) => account.status === 'active');
  const month = flow.period.from.slice(0, 7);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.displayName}`}
        description={`Resumen de ${formatMonth(month, locale)}`}
        action={
          active.length > 0 ? (
            <Link href="/movimientos/nuevo" className={linkButtonClass.primary}>
              Registrar movimiento
            </Link>
          ) : undefined
        }
      />

      {active.length === 0 ? (
        <EmptyState
          title="Empieza creando tu primera cuenta"
          action={
            <Link href="/cuentas/nueva" className={linkButtonClass.primary}>
              Crear cuenta
            </Link>
          }
        >
          Registra tu cuenta de ahorros, tu efectivo o tu tarjeta con el saldo que tienen hoy. A
          partir de ahí, cada gasto e ingreso actualizará el saldo automáticamente.
        </EmptyState>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Este mes</h2>
            <Link href="/movimientos" className="text-sm font-medium text-accent">
              Ver movimientos
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Ingresos" value={money(flow.income, locale)} />
            <Stat label="Gastos" value={money(flow.netExpenses, locale)} />
            <Stat
              label="Neto"
              value={money(flow.net, locale)}
              tone={isNegative(flow.net) ? 'negative' : 'positive'}
              hint={
                flow.savingsRate !== null
                  ? `Ahorro: ${formatPercent(flow.savingsRate, { locale, decimals: 1 })} de lo que entró`
                  : 'Aún no hay ingresos este mes'
              }
            />
          </dl>
          <p className="mt-4 text-xs text-text-muted">
            En {flow.baseCurrency}. Las transferencias entre tus cuentas y los pagos de tarjeta no
            cuentan como gasto.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Dólar hoy (TRM)</h2>
          {trm.rate ? (
            <div className="flex flex-col gap-2">
              <p className="text-3xl font-semibold tabular-nums">
                {formatRate(trm.rate.rate, trm.rate.quoteCurrency, { locale })}
              </p>
              {trm.change ? (
                <p className="text-sm text-text-muted">
                  {formatPercent(trm.change.relative, { locale, signed: true })} frente al{' '}
                  {formatDate(trm.change.previousDate, locale)}
                </p>
              ) : null}
              {trm.status === 'stale' ? (
                <Notice tone="warning">
                  Desactualizada: es la última publicada ({formatDate(trm.rate.rateDate, locale)}).
                </Notice>
              ) : null}
              <p className="text-xs text-text-muted">
                Fuente: {rateSourceLabel(trm.rate.source)} · vigente desde{' '}
                {formatDate(trm.rate.rateDate, locale)}
              </p>
            </div>
          ) : (
            <Notice>
              Datos temporalmente no disponibles. La TRM oficial se descarga automáticamente cuando
              el servicio de tareas (worker) está en marcha.
            </Notice>
          )}
        </Card>
      </div>

      {active.length > 0 ? (
        <Card>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Tus cuentas</h2>
            <Link href="/cuentas" className="text-sm font-medium text-accent">
              Gestionar cuentas
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {active.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-xs text-text-muted">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                    {account.nature === 'liability' ? ' · lo que debes' : ''}
                  </p>
                </div>
                <p
                  className={`font-semibold tabular-nums ${isNegative(account.balance.current) ? 'text-danger' : ''}`}
                >
                  {money(account.balance.current, locale)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
