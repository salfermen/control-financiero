import { type AccountDto, accountDtoSchema, listOf } from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, Card, EmptyState, PageHeader, linkButtonClass } from '@/components/ui';
import {
  ACCOUNT_TYPE_LABELS,
  type Locale,
  formatDate,
  isNegative,
  isZero,
  money,
} from '@/lib/format';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';

export const metadata: Metadata = { title: 'Cuentas' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const locale = session.user.settings.locale;
  const { data: accounts } = await serverApi('/accounts', listOf(accountDtoSchema));

  const assets = accounts.filter((a) => a.status === 'active' && a.nature === 'asset');
  const liabilities = accounts.filter((a) => a.status === 'active' && a.nature === 'liability');
  const closed = accounts.filter((a) => a.status === 'closed');

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Saldos calculados a hoy con tu saldo inicial y tus movimientos."
        action={
          <Link href="/cuentas/nueva" className={linkButtonClass.primary}>
            Nueva cuenta
          </Link>
        }
      />
      {accounts.length === 0 ? (
        <EmptyState
          title="Aún no tienes cuentas"
          action={
            <Link href="/cuentas/nueva" className={linkButtonClass.primary}>
              Crear la primera
            </Link>
          }
        >
          Una cuenta puede ser tu cuenta de ahorros, el efectivo de la billetera, una billetera
          digital (Nequi, Daviplata), una tarjeta de crédito o un préstamo.
        </EmptyState>
      ) : null}
      <AccountSection title="Dinero" accounts={assets} locale={locale} />
      <AccountSection
        title="Deudas"
        description="Tarjetas y préstamos: el saldo es lo que debes."
        accounts={liabilities}
        locale={locale}
      />
      <AccountSection title="Cerradas" accounts={closed} locale={locale} />
    </>
  );
}

function AccountSection({
  title,
  description,
  accounts,
  locale,
}: {
  title: string;
  description?: string;
  accounts: AccountDto[];
  locale: Locale;
}) {
  if (accounts.length === 0) return null;
  return (
    <section aria-labelledby={`seccion-${title}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`seccion-${title}`} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {accounts.map((account) => (
          <li key={account.id}>
            <Card className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  <p className="text-xs text-text-muted">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                    {account.institutionName ? ` · ${account.institutionName}` : ''} ·{' '}
                    {account.currency}
                  </p>
                </div>
                {account.status === 'closed' ? <Badge>Cerrada</Badge> : null}
              </div>
              <p
                className={`text-2xl font-semibold tabular-nums ${isNegative(account.balance.current) ? 'text-danger' : ''}`}
              >
                {money(account.balance.current, locale)}
              </p>
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                {!isZero(account.balance.pending) ? (
                  <p>Incluye {money(account.balance.pending, locale)} en movimientos pendientes.</p>
                ) : null}
                <p>
                  Saldo inicial {money(account.openingBalance, locale)} el{' '}
                  {formatDate(account.openingBalanceDate, locale)}
                </p>
                {account.balance.excludedBeforeOpening > 0 ? (
                  <p className="text-warning">
                    {account.balance.excludedBeforeOpening} movimiento(s) anteriores al saldo
                    inicial no se suman (ya están incluidos en él).
                  </p>
                ) : null}
              </div>
              <div className="mt-auto flex gap-4 text-sm font-medium">
                <Link href={`/movimientos?cuenta=${account.id}`} className="text-accent">
                  Movimientos
                </Link>
                <Link href={`/cuentas/${account.id}`} className="text-accent">
                  Editar
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
