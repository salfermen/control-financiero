import { formatPercent, formatRate } from '@cf/domain';
import {
  type AccountDto,
  type SummaryDto,
  accountDtoSchema,
  exchangeRateLookupDtoSchema,
  listOf,
  summaryDtoSchema,
} from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BudgetBar } from '@/components/budget-bar';
import { Card, EmptyState, Notice, PageHeader, Stat, linkButtonClass } from '@/components/ui';
import {
  ACCOUNT_TYPE_LABELS,
  type Locale,
  TRANSACTION_TYPE_LABELS,
  formatDate,
  formatMonth,
  isNegative,
  isZero,
  money,
  signedMoney,
} from '@/lib/format';
import { rateSourceLabel } from '@/lib/labels';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';

export const metadata: Metadata = { title: 'Inicio' };
export const dynamic = 'force-dynamic';

/**
 * Inicio: «¿cómo estoy?» con datos reales del usuario. Todas las cifras vienen
 * del resumen de la API (Financial Engine); la página solo las presenta. Sin
 * datos, lo dice; nunca muestra cifras de ejemplo.
 */
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { user } = session;
  const locale = user.settings.locale;

  const [summary, accounts, trm] = await Promise.all([
    serverApi('/summary', summaryDtoSchema),
    serverApi('/accounts', listOf(accountDtoSchema)),
    serverApi('/exchange-rates/current?base=USD&quote=COP', exchangeRateLookupDtoSchema),
  ]);
  const active = accounts.data.filter((account) => account.status === 'active');
  const month = summary.month.period.from.slice(0, 7);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.displayName}`}
        description={`Hoy es ${formatDate(summary.asOf, locale)} · ${formatMonth(month, locale)}`}
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
      ) : (
        <PositionCard summary={summary} locale={locale} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <MonthCard summary={summary} locale={locale} />
        <BudgetsCard summary={summary} locale={locale} />
        <UpcomingCard summary={summary} locale={locale} />

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

      {active.length > 0 ? <AccountsCard accounts={active} locale={locale} /> : null}
    </>
  );
}

function PositionCard({ summary, locale }: { summary: SummaryDto; locale: Locale }) {
  const { position } = summary;
  const monthEnd = formatDate(summary.monthEnd, locale);
  const notStarted = position.accounts.filter((account) => account.startsOn !== null);
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">¿Cómo estás?</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
        <Stat
          label="Disponible hoy"
          value={money(position.today.liquid, locale)}
          tone={isNegative(position.today.liquid) ? 'negative' : 'neutral'}
          hint="Ahorros, corriente, efectivo y billeteras. El cupo de tus tarjetas no cuenta."
        />
        <Stat
          label="Te queda a fin de mes"
          value={money(position.endOfMonth.liquid, locale)}
          tone={isNegative(position.endOfMonth.liquid) ? 'negative' : 'positive'}
          hint={`Con lo que tienes registrado hasta el ${monthEnd}.`}
        />
        <Stat
          label="Deudas"
          value={money(position.today.liabilities, locale)}
          hint="Lo que debes hoy en tarjetas y préstamos."
        />
        <Stat
          label="Patrimonio neto"
          value={money(position.today.netWorth, locale)}
          tone={isNegative(position.today.netWorth) ? 'negative' : 'neutral'}
          hint="Lo que tienes menos lo que debes."
        />
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        {notStarted.map((account) => (
          <Notice key={account.accountId}>
            «{account.name}» empieza el {formatDate(account.startsOn ?? '', locale)}: hoy no suma y
            su saldo inicial cuenta en «te queda a fin de mes».
          </Notice>
        ))}
        {position.scheduledAfterMonthEnd > 0 ? (
          <Notice>
            {position.scheduledAfterMonthEnd} movimiento(s) programado(s) después del {monthEnd} no
            entran en «te queda a fin de mes».
          </Notice>
        ) : null}
        {position.unconverted.map((account) => (
          <Notice key={account.accountId} tone="warning">
            «{account.name}» ({account.currency}) no se incluye: no hay una tasa de cambio confiable
            para hoy. Nunca usamos una tasa inventada.
          </Notice>
        ))}
        {position.estimated ? (
          <Notice tone="warning">
            Algunas cuentas en otra moneda se convirtieron con la última tasa publicada, no con la
            de hoy: esos totales son estimados.
          </Notice>
        ) : null}
        {position.accounts.some((a) => a.conversion !== null) ? (
          <p className="text-xs text-text-muted">
            Las cuentas en otra moneda se convirtieron a {summary.baseCurrency} con la tasa de hoy (
            {rateSourceLabel(
              position.accounts.find((a) => a.conversion !== null)?.conversion?.source ?? '',
            )}
            ).
          </p>
        ) : null}
        {position.excluded.length > 0 ? (
          <p className="text-xs text-text-muted">
            No incluidas en tu patrimonio (así lo marcaste):{' '}
            {position.excluded.map((a) => a.name).join(', ')}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function MonthCard({ summary, locale }: { summary: SummaryDto; locale: Locale }) {
  const { month } = summary;
  const scheduled = month.scheduled;
  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Este mes</h2>
        <Link href="/movimientos" className="text-sm font-medium text-accent">
          Ver movimientos
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <Stat
          label="Ingresos"
          value={money(month.income, locale)}
          hint={
            !isZero(scheduled.income)
              ? `Incluye ${money(scheduled.income, locale)} programado`
              : undefined
          }
        />
        <Stat
          label="Gastos"
          value={money(month.netExpenses, locale)}
          hint={
            !isZero(scheduled.netExpenses)
              ? `Incluye ${money(scheduled.netExpenses, locale)} programado`
              : undefined
          }
        />
        <Stat
          label="Neto"
          value={money(month.net, locale)}
          tone={isNegative(month.net) ? 'negative' : 'positive'}
          hint={
            month.savingsRate !== null
              ? `Ahorro: ${formatPercent(month.savingsRate, { locale, decimals: 1 })} de lo que entró`
              : 'Aún no hay ingresos este mes'
          }
        />
      </dl>
      <p className="mt-4 text-xs text-text-muted">
        En {summary.baseCurrency}, todo el mes (incluye lo programado). Las transferencias entre tus
        cuentas y los pagos de tarjeta no cuentan como gasto.
      </p>
    </Card>
  );
}

function BudgetsCard({ summary, locale }: { summary: SummaryDto; locale: Locale }) {
  const { budgets } = summary;
  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Presupuestos</h2>
        <Link href="/presupuestos" className="text-sm font-medium text-accent">
          {budgets.count > 0 ? 'Ver todos' : 'Crear presupuesto'}
        </Link>
      </div>
      {budgets.count === 0 ? (
        <p className="text-sm text-text-muted">
          Ponle un límite mensual a tus gastos (global o por categoría) y te avisamos al llegar al
          75 %, 90 % y 100 %.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {budgets.top.map((budget) => (
            <li key={budget.id}>
              <BudgetBar budget={budget} locale={locale} compact />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UpcomingCard({ summary, locale }: { summary: SummaryDto; locale: Locale }) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Próximos movimientos</h2>
      {summary.upcoming.length === 0 ? (
        <p className="text-sm text-text-muted">
          No tienes movimientos con fecha futura. Puedes registrar un gasto o ingreso con una fecha
          posterior a hoy para planearlo.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {summary.upcoming.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <Link href={`/movimientos/${item.id}`} className="block truncate font-medium">
                  {item.description}
                </Link>
                <p className="text-xs text-text-muted">
                  {formatDate(item.transactionDate, locale)} · {item.accountName} ·{' '}
                  {TRANSACTION_TYPE_LABELS[item.type]}
                </p>
              </div>
              <p
                className={`shrink-0 font-semibold tabular-nums ${item.direction === 'inflow' ? 'text-positive' : ''}`}
              >
                {signedMoney(item.amount, item.direction, locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AccountsCard({ accounts, locale }: { accounts: AccountDto[]; locale: Locale }) {
  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Tus cuentas</h2>
        <Link href="/cuentas" className="text-sm font-medium text-accent">
          Gestionar cuentas
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {accounts.map((account) => {
          const { balance } = account;
          const hasScheduled = balance.scheduledCount > 0 || balance.startsOn !== null;
          return (
            <li key={account.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="text-xs text-text-muted">
                  {ACCOUNT_TYPE_LABELS[account.type]}
                  {account.nature === 'liability' ? ' · lo que debes' : ''}
                </p>
              </div>
              <div className="text-right">
                {balance.startsOn ? (
                  <p className="text-sm text-text-muted">
                    Empieza el {formatDate(balance.startsOn, locale)}
                  </p>
                ) : (
                  <p
                    className={`font-semibold tabular-nums ${isNegative(balance.current) ? 'text-danger' : ''}`}
                  >
                    {money(balance.current, locale)}
                  </p>
                )}
                {hasScheduled ? (
                  <p className="text-xs text-text-muted">
                    {account.nature === 'liability' ? 'Deberás' : 'Te queda'}{' '}
                    <span
                      className={`font-medium tabular-nums ${isNegative(balance.projected) ? 'text-danger' : 'text-text'}`}
                    >
                      {money(balance.projected, locale)}
                    </span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
