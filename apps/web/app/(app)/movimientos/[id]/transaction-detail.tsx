'use client';

import { type CategoryDto, type TransactionDto, listOf, transactionDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  Alert,
  Badge,
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
import {
  type Locale,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPE_LABELS,
  formatDate,
  money,
  signedMoney,
} from '@/lib/format';
import { categoryOptions, rateSourceLabel } from '@/lib/labels';

interface Props {
  locale: Locale;
  transaction: TransactionDto;
  accounts: { id: string; name: string; currency: string }[];
  categories: CategoryDto[];
}

const EDIT_FIELDS = [
  'description',
  'categoryId',
  'transactionDate',
  'amount',
  'merchantName',
  'paymentMethod',
  'notes',
  'status',
];

/** Detalle de un movimiento: datos, procedencia, corrección, reembolso y borrado. */
export function TransactionDetail({ locale, transaction: tx, accounts, categories }: Props) {
  const router = useRouter();
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const account = accounts.find((a) => a.id === tx.accountId);
  const linked = tx.transferGroupId !== null || tx.type === 'refund';
  const amountEditable = !linked && tx.fx === null;
  const canRefund = (tx.type === 'expense' || tx.type === 'fee') && tx.status !== 'void';
  const kind = tx.type === 'income' ? 'income' : 'expense';

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [amount, setAmount] = useState(amountToInput(tx.amount.amount, locale));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = previewAmount(amount, tx.amount.currency, locale);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => formText(form, name);
    const changes: Record<string, unknown> = {};
    if (text('description') !== tx.description) changes.description = text('description');
    if (text('notes') !== (tx.notes ?? '')) changes.notes = text('notes');
    const status = form.get('pending') === 'on' ? 'pending' : 'posted';
    if (tx.status !== 'void' && status !== tx.status) changes.status = status;
    if (!linked) {
      const categoryId = text('categoryId') || null;
      if (categoryId !== tx.categoryId) changes.categoryId = categoryId;
      if (text('transactionDate') !== tx.transactionDate)
        changes.transactionDate = text('transactionDate');
      if (text('merchantName') !== (tx.merchantName ?? ''))
        changes.merchantName = text('merchantName');
      const method = text('paymentMethod') || null;
      if (method !== tx.paymentMethod) changes.paymentMethod = method;
    }
    if (amountEditable) {
      if (!preview.valid || preview.value === null) return;
      if (
        previewAmount(amountToInput(tx.amount.amount, locale), tx.amount.currency, locale).value !==
        preview.value
      ) {
        changes.amount = preview.value;
      }
    }
    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }
    await run(async () => {
      await apiRequest(`/transactions/${tx.id}`, {
        method: 'PATCH',
        body: changes,
        schema: transactionDtoSchema,
      });
      router.refresh();
    });
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    await run(async () => {
      await apiRequest(`/transactions/${tx.id}`, { method: 'DELETE' });
      router.push(`/movimientos?mes=${tx.transactionDate.slice(0, 7)}`);
      router.refresh();
    });
    setConfirmDelete(false);
  }

  const general = generalMessage(error, EDIT_FIELDS);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p
          className={`text-3xl font-semibold tabular-nums ${tx.direction === 'inflow' ? 'text-positive' : ''}`}
        >
          {signedMoney(tx.amount, tx.direction, locale)}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge>{TRANSACTION_TYPE_LABELS[tx.type]}</Badge>
          {tx.status === 'pending' ? <Badge tone="warning">Pendiente</Badge> : null}
          {tx.status === 'void' ? <Badge>Anulado</Badge> : null}
          {tx.fx?.estimated ? <Badge tone="accent">≈ estimado</Badge> : null}
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">Fecha</dt>
            <dd className="first-letter:uppercase">
              {formatDate(tx.transactionDate, locale, 'long')}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Cuenta</dt>
            <dd>
              {accountName.get(tx.accountId) ?? '—'}
              {tx.counterpartAccountId
                ? ` ${tx.direction === 'outflow' ? '→' : '←'} ${accountName.get(tx.counterpartAccountId) ?? 'otra cuenta'}`
                : ''}
            </dd>
          </div>
          {tx.original.currency !== tx.amount.currency || tx.fx ? (
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Conversión</dt>
              <dd>
                Original {money(tx.original, locale)}
                {tx.fx?.accountRate ? ` · tasa ${tx.fx.accountRate.replace(/\.?0+$/, '')}` : ''}
                {tx.fx ? ` · ${rateSourceLabel(tx.fx.source)}` : ''}
                {tx.base.currency !== tx.amount.currency
                  ? ` · en tu moneda base: ${money(tx.base, locale)}`
                  : ''}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-text-muted">Origen</dt>
            <dd>{tx.source === 'manual' ? 'Registrado por ti' : tx.source}</dd>
          </div>
          {tx.paymentMethod ? (
            <div>
              <dt className="text-text-muted">Medio de pago</dt>
              <dd>{PAYMENT_METHOD_LABELS[tx.paymentMethod]}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Corregir</h2>
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4" noValidate>
          {general ? <Alert>{general}</Alert> : null}
          <Field
            id="description"
            label="Descripción"
            required
            maxLength={255}
            defaultValue={tx.description}
            error={error?.fieldError('description')}
          />
          {!linked ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="amount"
                  label={`Monto (${tx.amount.currency})`}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!amountEditable}
                  hint={
                    amountEditable
                      ? (preview.message ?? undefined)
                      : 'Con cambio de moneda el monto no se edita: elimínalo y regístralo de nuevo.'
                  }
                  error={error?.fieldError('amount')}
                />
                <Field
                  id="transactionDate"
                  label="Fecha"
                  type="date"
                  defaultValue={tx.transactionDate}
                  error={error?.fieldError('transactionDate')}
                />
              </div>
              <SelectField
                id="categoryId"
                label="Categoría"
                defaultValue={tx.categoryId ?? ''}
                error={error?.fieldError('categoryId')}
              >
                <option value="">Sin categoría</option>
                {categoryOptions(categories, kind).map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>
                    {depth > 0 ? `— ${category.name}` : category.name}
                  </option>
                ))}
              </SelectField>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="merchantName"
                  label="Comercio"
                  maxLength={120}
                  defaultValue={tx.merchantName ?? ''}
                  error={error?.fieldError('merchantName')}
                />
                <SelectField
                  id="paymentMethod"
                  label="Medio de pago"
                  defaultValue={tx.paymentMethod ?? ''}
                  error={error?.fieldError('paymentMethod')}
                >
                  <option value="">Sin especificar</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted">
              En transferencias, pagos y reembolsos solo se corrigen la descripción, las notas y el
              estado.
            </p>
          )}
          {tx.status !== 'void' ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pending" defaultChecked={tx.status === 'pending'} />
              Pendiente
            </label>
          ) : null}
          <TextAreaField
            id="notes"
            label="Notas"
            maxLength={2000}
            defaultValue={tx.notes ?? ''}
            error={error?.fieldError('notes')}
          />
          <SubmitButton pending={pending}>Guardar cambios</SubmitButton>
        </form>
      </Card>

      {canRefund ? (
        <RefundCard
          locale={locale}
          tx={tx}
          accountCurrency={account?.currency ?? tx.amount.currency}
        />
      ) : null}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Eliminar</h2>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {tx.transferGroupId
                ? 'Se eliminarán las dos partes de esta transferencia.'
                : '¿Eliminar este movimiento?'}{' '}
              El saldo se recalculará.
            </p>
            <Button variant="danger" onClick={() => void remove()} disabled={pending}>
              Sí, eliminar
            </Button>
            <Button onClick={() => setConfirmDelete(false)} disabled={pending}>
              No
            </Button>
          </div>
        ) : (
          <Button onClick={() => setConfirmDelete(true)} className="self-start">
            Eliminar movimiento
          </Button>
        )}
      </Card>
    </div>
  );
}

function RefundCard({
  locale,
  tx,
  accountCurrency,
}: {
  locale: Locale;
  tx: TransactionDto;
  accountCurrency: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [charged, setCharged] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const preview = previewAmount(amount, tx.original.currency, locale);
  const otherCurrency = tx.original.currency !== accountCurrency;
  const chargedPreview = previewAmount(charged, accountCurrency, locale);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview.valid) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiRequest('/transactions', {
        method: 'POST',
        schema: listOf(transactionDtoSchema),
        body: {
          kind: 'refund',
          refundOfId: tx.id,
          amount: preview.value,
          transactionDate: formText(form, 'refundDate'),
          ...(otherCurrency && chargedPreview.valid
            ? { fx: { accountAmount: chargedPreview.value } }
            : {}),
        },
      });
      setAmount('');
      setCharged('');
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setPending(false);
    }
  }

  const general = generalMessage(error, ['amount', 'transactionDate', 'fx']);
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Registrar reembolso</h2>
      <p className="mb-4 text-sm text-text-muted">
        Un reembolso reduce el gasto de su categoría; no cuenta como ingreso. Tope: lo que costó la
        compra ({money(tx.original, locale)}).
      </p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        {general ? <Alert>{general}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="refundAmount"
            label={`Monto devuelto (${tx.original.currency})`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={preview.valid ? (preview.message ?? undefined) : undefined}
            error={error?.fieldError('amount')}
          />
          <Field
            id="refundDate"
            label="Fecha del reembolso"
            type="date"
            defaultValue={tx.transactionDate}
            error={error?.fieldError('transactionDate')}
          />
        </div>
        {otherCurrency ? (
          <Field
            id="refundCharged"
            label={`Valor abonado en ${accountCurrency} (opcional)`}
            inputMode="decimal"
            value={charged}
            onChange={(e) => setCharged(e.target.value)}
            hint={
              chargedPreview.valid
                ? (chargedPreview.message ?? undefined)
                : 'Si lo dejas vacío se usa la TRM oficial del día.'
            }
            error={error?.fieldError('fx')}
          />
        ) : null}
        <SubmitButton pending={pending}>Registrar reembolso</SubmitButton>
      </form>
    </Card>
  );
}
