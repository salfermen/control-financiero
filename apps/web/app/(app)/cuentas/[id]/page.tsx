import { accountDtoSchema, currencyDtoSchema, listOf } from '@cf/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { ACCOUNT_TYPE_LABELS } from '@/lib/format';
import { ApiNotFoundError, serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { AccountForm } from '../account-form';

export const metadata: Metadata = { title: 'Editar cuenta' };
export const dynamic = 'force-dynamic';

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { id } = await params;
  const [account, currencies] = await Promise.all([
    serverApi(`/accounts/${encodeURIComponent(id)}`, accountDtoSchema).catch((error: unknown) => {
      if (error instanceof ApiNotFoundError) notFound();
      throw error;
    }),
    serverApi('/currencies', listOf(currencyDtoSchema)),
  ]);
  return (
    <>
      <PageHeader
        title={account.name}
        description={`${ACCOUNT_TYPE_LABELS[account.type]} en ${account.currency}. La moneda y el tipo no se cambian.`}
      />
      <AccountForm
        mode="edit"
        locale={session.user.settings.locale}
        currencies={currencies.data}
        account={account}
      />
    </>
  );
}
