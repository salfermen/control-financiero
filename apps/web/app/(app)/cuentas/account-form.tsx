'use client';

import { ACCOUNT_TYPES, accountNature } from '@cf/domain';
import { type AccountDto, type CurrencyDto, accountDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  SelectField,
  SubmitButton,
  TextAreaField,
} from '@/components/ui';
import { type ApiError, apiRequest } from '@/lib/api-client';
import { amountToInput, previewAmount } from '@/lib/amount-input';
import { formText, generalMessage, toApiError } from '@/lib/form-errors';
import { ACCOUNT_TYPE_LABELS, type Locale } from '@/lib/format';

type Props =
  | {
      mode: 'create';
      locale: Locale;
      currencies: CurrencyDto[];
      defaults: { currency: string; openingBalanceDate: string };
      account?: undefined;
    }
  | {
      mode: 'edit';
      locale: Locale;
      currencies: CurrencyDto[];
      account: AccountDto;
      defaults?: undefined;
    };

const FIELDS = [
  'name',
  'type',
  'currency',
  'institutionName',
  'openingBalance',
  'openingBalanceDate',
  'notes',
] as const;

/** Formulario de cuenta: crear o editar (nombre, saldo inicial, cierre, borrado). */
export function AccountForm(props: Props) {
  const { mode, locale, currencies, account } = props;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [type, setType] = useState<string>(account?.type ?? 'savings');
  const [currency, setCurrency] = useState(account?.currency ?? props.defaults?.currency ?? 'COP');
  const [opening, setOpening] = useState(
    account ? amountToInput(account.openingBalance.amount, locale) : '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const liability = accountNature(type as (typeof ACCOUNT_TYPES)[number]) === 'liability';
  const preview = previewAmount(opening === '' ? '0' : opening, currency, locale, {
    allowNegative: true,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview.valid || preview.value === null) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => formText(form, name);
    setPending(true);
    setError(null);
    try {
      if (mode === 'create') {
        await apiRequest('/accounts', {
          method: 'POST',
          schema: accountDtoSchema,
          body: {
            name: text('name'),
            type,
            currency,
            institutionName: text('institutionName'),
            openingBalance: preview.value,
            openingBalanceDate: text('openingBalanceDate'),
            includeInNetWorth: form.get('includeInNetWorth') === 'on',
            notes: text('notes'),
          },
        });
      } else {
        await apiRequest(`/accounts/${account.id}`, {
          method: 'PATCH',
          schema: accountDtoSchema,
          body: {
            name: text('name'),
            institutionName: text('institutionName'),
            openingBalance: preview.value,
            openingBalanceDate: text('openingBalanceDate'),
            includeInNetWorth: form.get('includeInNetWorth') === 'on',
            notes: text('notes'),
          },
        });
      }
      router.push('/cuentas');
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setPending(false);
    }
  }

  async function changeStatus(status: 'active' | 'closed') {
    if (!account) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/accounts/${account.id}`, {
        method: 'PATCH',
        schema: accountDtoSchema,
        body: { status },
      });
      router.push('/cuentas');
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setPending(false);
    }
  }

  async function remove() {
    if (!account) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/accounts/${account.id}`, { method: 'DELETE' });
      router.push('/cuentas');
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setConfirmDelete(false);
      setPending(false);
    }
  }

  const general = generalMessage(error, FIELDS);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          {general ? <Alert>{general}</Alert> : null}
          <Field
            id="name"
            label="Nombre"
            required
            maxLength={80}
            defaultValue={account?.name}
            placeholder="Ej.: Bancolombia ahorros"
            error={error?.fieldError('name')}
          />
          {mode === 'create' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="type"
                label="Tipo"
                value={type}
                onChange={(e) => setType(e.target.value)}
                error={error?.fieldError('type')}
              >
                {ACCOUNT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {ACCOUNT_TYPE_LABELS[value]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="currency"
                label="Moneda"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                error={error?.fieldError('currency')}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {locale === 'en-US' ? c.nameEn : c.nameEs}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
          <Field
            id="institutionName"
            label="Banco o entidad (opcional)"
            maxLength={80}
            defaultValue={account?.institutionName ?? ''}
            error={error?.fieldError('institutionName')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="openingBalance"
              label={liability ? 'Lo que debes en esa fecha' : 'Saldo en esa fecha'}
              inputMode="decimal"
              autoComplete="off"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0"
              hint={
                preview.message ??
                (liability ? 'Positivo = deuda.' : 'Puede ser negativo si está sobregirada.')
              }
              error={
                error?.fieldError('openingBalance') ??
                (preview.valid ? undefined : (preview.message ?? undefined))
              }
            />
            <Field
              id="openingBalanceDate"
              label="Fecha del saldo"
              type="date"
              required
              defaultValue={account?.openingBalanceDate ?? props.defaults?.openingBalanceDate}
              hint="Los movimientos desde este día ajustan el saldo."
              error={error?.fieldError('openingBalanceDate')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="includeInNetWorth"
              defaultChecked={account?.includeInNetWorth ?? true}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Incluir en mi patrimonio
          </label>
          <TextAreaField
            id="notes"
            label="Notas (opcional)"
            maxLength={2000}
            defaultValue={account?.notes ?? ''}
            error={error?.fieldError('notes')}
          />
          <div className="flex flex-wrap gap-3">
            <SubmitButton pending={pending}>
              {mode === 'create' ? 'Crear cuenta' : 'Guardar cambios'}
            </SubmitButton>
            <Button onClick={() => router.back()} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>

      {account ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Estado de la cuenta</h2>
          {account.status === 'active' ? (
            <>
              <p className="text-sm text-text-muted">
                Cerrar la cuenta la oculta para nuevos movimientos y conserva su historial.
              </p>
              <Button
                onClick={() => void changeStatus('closed')}
                disabled={pending}
                className="self-start"
              >
                Cerrar cuenta
              </Button>
            </>
          ) : (
            <Button
              onClick={() => void changeStatus('active')}
              disabled={pending}
              className="self-start"
            >
              Reabrir cuenta
            </Button>
          )}
          {account.balance.transactionCount === 0 ? (
            confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">¿Eliminar «{account.name}»? No se puede deshacer.</p>
                <Button variant="danger" onClick={() => void remove()} disabled={pending}>
                  Sí, eliminar
                </Button>
                <Button onClick={() => setConfirmDelete(false)} disabled={pending}>
                  No
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="self-start">
                Eliminar cuenta (no tiene movimientos)
              </Button>
            )
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
