import { localDateInTimeZone } from '@cf/domain';
import { accountDtoSchema, categoryDtoSchema, currencyDtoSchema, listOf } from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState, PageHeader, linkButtonClass } from '@/components/ui';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { TransactionForm } from './transaction-form';

export const metadata: Metadata = { title: 'Registrar movimiento' };
export const dynamic = 'force-dynamic';

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; cuenta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { settings } = session.user;
  const params = await searchParams;
  const [accounts, categories, currencies] = await Promise.all([
    serverApi('/accounts', listOf(accountDtoSchema)),
    serverApi('/categories', listOf(categoryDtoSchema)),
    serverApi('/currencies', listOf(currencyDtoSchema)),
  ]);
  const active = accounts.data.filter((a) => a.status === 'active');
  if (active.length === 0) {
    return (
      <EmptyState
        title="Primero crea una cuenta"
        action={
          <Link href="/cuentas/nueva" className={linkButtonClass.primary}>
            Crear cuenta
          </Link>
        }
      >
        Cada movimiento sale de una cuenta o llega a ella.
      </EmptyState>
    );
  }
  const kind =
    params.tipo === 'ingreso' ? 'income' : params.tipo === 'transferencia' ? 'transfer' : 'expense';
  return (
    <>
      <PageHeader title="Registrar movimiento" />
      <TransactionForm
        locale={settings.locale}
        today={localDateInTimeZone(new Date(), settings.timezone)}
        initialKind={kind}
        initialAccountId={active.some((a) => a.id === params.cuenta) ? params.cuenta : undefined}
        accounts={active.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
          nature: a.nature,
          type: a.type,
        }))}
        categories={categories.data}
        currencies={currencies.data.map((c) => c.code)}
      />
    </>
  );
}
