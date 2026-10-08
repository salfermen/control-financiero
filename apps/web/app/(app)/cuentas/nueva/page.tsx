import { currencyDtoSchema, listOf } from '@cf/shared';
import { localDateInTimeZone } from '@cf/domain';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { AccountForm } from '../account-form';

export const metadata: Metadata = { title: 'Nueva cuenta' };
export const dynamic = 'force-dynamic';

export default async function NewAccountPage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { settings } = session.user;
  const { data: currencies } = await serverApi('/currencies', listOf(currencyDtoSchema));
  return (
    <>
      <PageHeader
        title="Nueva cuenta"
        description="Escribe el saldo que tiene hoy (o en la fecha desde la que quieres llevar el control)."
      />
      <AccountForm
        mode="create"
        locale={settings.locale}
        currencies={currencies}
        defaults={{
          currency: settings.baseCurrency,
          openingBalanceDate: localDateInTimeZone(new Date(), settings.timezone),
        }}
      />
    </>
  );
}
