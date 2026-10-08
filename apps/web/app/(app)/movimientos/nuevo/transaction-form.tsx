'use client';

import { type CategoryDto, listOf, transactionDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  Notice,
  SelectField,
  SubmitButton,
  TextAreaField,
} from '@/components/ui';
import { type ApiError, apiRequest } from '@/lib/api-client';
import { previewAmount, previewRate } from '@/lib/amount-input';
import { formText, generalMessage, toApiError } from '@/lib/form-errors';
import { ACCOUNT_TYPE_LABELS, type Locale, PAYMENT_METHOD_LABELS } from '@/lib/format';
import { categoryOptions } from '@/lib/labels';

type Kind = 'expense' | 'income' | 'transfer';
type FxMode = 'official' | 'charged' | 'rate';

interface AccountOption {
  id: string;
  name: string;
  currency: string;
  nature: 'asset' | 'liability';
  type: keyof typeof ACCOUNT_TYPE_LABELS;
}

interface Props {
  locale: Locale;
  today: string;
  initialKind: Kind;
  initialAccountId?: string | undefined;
  accounts: AccountOption[];
  categories: CategoryDto[];
  currencies: string[];
}

const KIND_LABELS: Record<Kind, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia o pago',
};

const FIELDS = [
  'accountId',
  'fromAccountId',
  'toAccountId',
  'amount',
  'currency',
  'fx',
  'fx.accountAmount',
  'fx.rate',
  'receivedAmount',
  'receivedDate',
  'transactionDate',
  'description',
  'categoryId',
  'merchantName',
  'paymentMethod',
  'notes',
];

/**
 * Registro rápido: monto, descripción y listo (cuenta, fecha y moneda vienen
 * prellenadas). Los cálculos los hace la API con el Financial Engine; aquí
 * solo se muestra cómo se interpretó cada monto antes de guardar.
 */
export function TransactionForm(props: Props) {
  const { locale, today, accounts, categories, currencies } = props;
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(props.initialKind);
  const [accountId, setAccountId] = useState(props.initialAccountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.id !== (props.initialAccountId ?? accounts[0]?.id))?.id ?? '',
  );
  const account = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const [currency, setCurrency] = useState(account?.currency ?? 'COP');
  const [amount, setAmount] = useState('');
  const [fxMode, setFxMode] = useState<FxMode>('official');
  const [fxValue, setFxValue] = useState('');
  const [received, setReceived] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const accountCurrency = account?.currency ?? 'COP';
  const amountCurrency = kind === 'transfer' ? accountCurrency : currency;
  const amountPreview = previewAmount(amount, amountCurrency, locale);
  const needsFx = kind !== 'transfer' && currency !== accountCurrency;
  const fxPreview =
    fxMode === 'rate'
      ? previewRate(fxValue, locale, currency, accountCurrency)
      : previewAmount(fxValue, accountCurrency, locale);
  const crossCurrencyTransfer =
    kind === 'transfer' && toAccount && toAccount.currency !== accountCurrency;
  const receivedPreview = previewAmount(received, toAccount?.currency ?? accountCurrency, locale);
  const options = categoryOptions(categories, kind === 'income' ? 'income' : 'expense');

  function selectAccount(id: string) {
    setAccountId(id);
    const selected = accounts.find((a) => a.id === id);
    if (selected) setCurrency(selected.currency);
    if (id === toAccountId) setToAccountId(accounts.find((a) => a.id !== id)?.id ?? '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!amountPreview.valid) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => formText(form, name);
    const date = text('transactionDate');
    let body: Record<string, unknown>;
    if (kind === 'transfer') {
      body = {
        kind: 'transfer',
        fromAccountId: accountId,
        toAccountId,
        amount: amountPreview.value,
        transactionDate: date,
        ...(crossCurrencyTransfer && receivedPreview.valid
          ? { receivedAmount: receivedPreview.value }
          : {}),
        ...(text('receivedDate') ? { receivedDate: text('receivedDate') } : {}),
        ...(text('description') ? { description: text('description') } : {}),
        status: form.get('pending') === 'on' ? 'pending' : 'posted',
        notes: text('notes'),
      };
    } else {
      let fx: Record<string, string> | undefined;
      if (needsFx && fxMode !== 'official') {
        if (!fxPreview.valid || fxPreview.value === null) return;
        fx = fxMode === 'charged' ? { accountAmount: fxPreview.value } : { rate: fxPreview.value };
      }
      body = {
        kind,
        accountId,
        amount: amountPreview.value,
        currency,
        ...(fx ? { fx } : {}),
        transactionDate: date,
        description: text('description'),
        ...(text('categoryId') ? { categoryId: text('categoryId') } : {}),
        merchantName: text('merchantName'),
        ...(text('paymentMethod') ? { paymentMethod: text('paymentMethod') } : {}),
        status: form.get('pending') === 'on' ? 'pending' : 'posted',
        notes: text('notes'),
      };
    }

    setPending(true);
    setError(null);
    try {
      await apiRequest('/transactions', {
        method: 'POST',
        body,
        schema: listOf(transactionDtoSchema),
      });
      router.push(`/movimientos?mes=${date.slice(0, 7)}`);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setPending(false);
    }
  }

  const fieldError = (path: string) => error?.fieldError(path);
  const general = generalMessage(error, FIELDS);

  return (
    <Card className="max-w-2xl">
      <div role="group" aria-label="Tipo de movimiento" className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(KIND_LABELS) as Kind[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setError(null);
            }}
            disabled={value === 'transfer' && accounts.length < 2}
            className={`rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${kind === value ? 'bg-accent text-accent-contrast' : 'border border-border'}`}
          >
            {KIND_LABELS[value]}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        {general ? <Alert>{general}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id={kind === 'transfer' ? 'fromAccountId' : 'accountId'}
            label={kind === 'transfer' ? 'Desde' : 'Cuenta'}
            value={accountId}
            onChange={(e) => selectAccount(e.target.value)}
            error={fieldError(kind === 'transfer' ? 'fromAccountId' : 'accountId')}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </SelectField>
          {kind === 'transfer' ? (
            <SelectField
              id="toAccountId"
              label="Hacia"
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              error={fieldError('toAccountId')}
              hint={
                toAccount?.nature === 'liability'
                  ? 'Abono a una deuda: se registra como pago, no como gasto.'
                  : undefined
              }
            >
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </SelectField>
          ) : (
            <Field
              id="transactionDate"
              label="Fecha"
              type="date"
              required
              defaultValue={today}
              error={fieldError('transactionDate')}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field
            id="amount"
            label={kind === 'transfer' ? `Monto que sale (${accountCurrency})` : 'Monto'}
            inputMode="decimal"
            autoComplete="off"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            hint={amountPreview.valid ? (amountPreview.message ?? undefined) : undefined}
            error={
              fieldError('amount') ??
              (amount && !amountPreview.valid ? (amountPreview.message ?? undefined) : undefined)
            }
          />
          {kind !== 'transfer' ? (
            <SelectField
              id="currency"
              label="Moneda"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              error={fieldError('currency')}
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </SelectField>
          ) : null}
        </div>

        {needsFx ? (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-medium">
              Conversión de {currency} a {accountCurrency}
            </legend>
            {(
              [
                ['official', 'Usar la tasa oficial del día (TRM), si está disponible'],
                ['charged', `Escribir lo que me cobraron en ${accountCurrency}`],
                ['rate', 'Escribir la tasa que aplicó mi banco'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fxMode"
                  value={value}
                  checked={fxMode === value}
                  onChange={() => setFxMode(value)}
                />
                {label}
              </label>
            ))}
            {fxMode !== 'official' ? (
              <Field
                id="fxValue"
                label={
                  fxMode === 'charged'
                    ? `Valor cobrado (${accountCurrency})`
                    : `${accountCurrency} por 1 ${currency}`
                }
                inputMode="decimal"
                autoComplete="off"
                value={fxValue}
                onChange={(e) => setFxValue(e.target.value)}
                hint={
                  fxPreview.valid && fxMode === 'charged'
                    ? (fxPreview.message ?? undefined)
                    : undefined
                }
                error={
                  fieldError(fxMode === 'charged' ? 'fx.accountAmount' : 'fx.rate') ??
                  (fxValue && !fxPreview.valid ? (fxPreview.message ?? undefined) : undefined)
                }
              />
            ) : (
              <p className="text-xs text-text-muted">
                El valor quedará marcado como estimado. Cuando llegue el extracto, el valor cobrado
                por el banco es el más exacto.
              </p>
            )}
            {fieldError('fx') ? <Notice tone="warning">{fieldError('fx')}</Notice> : null}
          </fieldset>
        ) : null}

        {kind === 'transfer' ? (
          <>
            {crossCurrencyTransfer ? (
              <Field
                id="receivedAmount"
                label={`Monto que llega (${toAccount.currency})`}
                inputMode="decimal"
                autoComplete="off"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                hint={
                  receivedPreview.valid
                    ? (receivedPreview.message ?? undefined)
                    : 'Si lo dejas vacío se usa la TRM oficial del día.'
                }
                error={fieldError('receivedAmount')}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="transactionDate"
                label="Fecha"
                type="date"
                required
                defaultValue={today}
                error={fieldError('transactionDate')}
              />
              <Field
                id="receivedDate"
                label="Fecha de llegada (opcional)"
                type="date"
                hint="Solo si llega otro día."
                error={fieldError('receivedDate')}
              />
            </div>
            <Field
              id="description"
              label="Descripción (opcional)"
              maxLength={255}
              placeholder={
                toAccount?.nature === 'liability'
                  ? 'Pago de tarjeta'
                  : 'Transferencia entre cuentas'
              }
              error={fieldError('description')}
            />
          </>
        ) : (
          <>
            <Field
              id="description"
              label="Descripción"
              required
              maxLength={255}
              placeholder={
                kind === 'income' ? 'Ej.: Sueldo de octubre' : 'Ej.: Mercado de la semana'
              }
              error={fieldError('description')}
            />
            <SelectField
              id="categoryId"
              label="Categoría"
              defaultValue=""
              error={fieldError('categoryId')}
            >
              <option value="">Sin categoría</option>
              {options.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {depth > 0 ? `— ${category.name}` : category.name}
                </option>
              ))}
            </SelectField>
          </>
        )}

        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Más detalles</summary>
          <div className="mt-4 flex flex-col gap-4">
            {kind !== 'transfer' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="merchantName"
                  label="Comercio (opcional)"
                  maxLength={120}
                  error={fieldError('merchantName')}
                />
                <SelectField
                  id="paymentMethod"
                  label="Medio de pago"
                  defaultValue=""
                  error={fieldError('paymentMethod')}
                >
                  <option value="">Sin especificar</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pending" />
              Pendiente (autorizado, aún sin asentar en el banco)
            </label>
            <TextAreaField
              id="notes"
              label="Notas (opcional)"
              maxLength={2000}
              error={fieldError('notes')}
            />
          </div>
        </details>

        <div className="flex flex-wrap gap-3">
          <SubmitButton pending={pending}>Guardar</SubmitButton>
          <Button onClick={() => router.back()} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
