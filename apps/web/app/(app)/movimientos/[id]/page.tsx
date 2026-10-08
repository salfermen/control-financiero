import { accountDtoSchema, categoryDtoSchema, listOf, transactionDtoSchema } from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { TRANSACTION_TYPE_LABELS } from '@/lib/format';
import { ApiNotFoundError, serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { TransactionDetail } from './transaction-detail';

export const metadata: Metadata = { title: 'Movimiento' };
export const dynamic = 'force-dynamic';

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { id } = await params;
  const [transaction, accounts, categories] = await Promise.all([
    serverApi(`/transactions/${encodeURIComponent(id)}`, transactionDtoSchema).catch(
      (error: unknown) => {
        if (error instanceof ApiNotFoundError) notFound();
        throw error;
      },
    ),
    serverApi('/accounts', listOf(accountDtoSchema)),
    serverApi('/categories', listOf(categoryDtoSchema)),
  ]);
  return (
    <>
      <PageHeader
        title={transaction.description}
        description={TRANSACTION_TYPE_LABELS[transaction.type]}
        action={
          <Link
            href={`/movimientos?mes=${transaction.transactionDate.slice(0, 7)}`}
            className="text-sm font-medium text-accent"
          >
            Volver a movimientos
          </Link>
        }
      />
      <TransactionDetail
        locale={session.user.settings.locale}
        transaction={transaction}
        accounts={accounts.data.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        categories={categories.data}
      />
    </>
  );
}
