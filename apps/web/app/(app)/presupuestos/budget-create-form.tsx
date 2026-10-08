'use client';

import { budgetStatusDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Field, SelectField, SubmitButton } from '@/components/ui';
import { type ApiError, apiRequest } from '@/lib/api-client';
import { previewAmount } from '@/lib/amount-input';
import { formText, generalMessage, toApiError } from '@/lib/form-errors';
import type { Locale } from '@/lib/format';

const FIELDS = ['categoryId', 'amount'] as const;

/** Crea un presupuesto que rige desde el mes que se está viendo. */
export function BudgetCreateForm({
  locale,
  month,
  monthName,
  baseCurrency,
  allowGlobal,
  options,
}: {
  locale: Locale;
  month: string;
  monthName: string;
  baseCurrency: string;
  allowGlobal: boolean;
  options: { id: string; name: string; depth: number }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [amount, setAmount] = useState('');
  const preview = previewAmount(amount, baseCurrency, locale);

  if (!allowGlobal && options.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Ya tienes presupuesto para todos los gastos y para cada categoría en {monthName}.
      </p>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview.valid || preview.value === null) return;
    const form = event.currentTarget;
    const category = formText(new FormData(form), 'categoryId');
    setPending(true);
    setError(null);
    try {
      await apiRequest('/budgets', {
        method: 'POST',
        schema: budgetStatusDtoSchema,
        body: {
          categoryId: category === 'global' ? null : category,
          amount: preview.value,
          startMonth: month,
        },
      });
      setAmount('');
      form.reset();
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setPending(false);
    }
  }

  const general = generalMessage(error, FIELDS);
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      {general ? <Alert>{general}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="categoryId"
          label="¿Para qué gastos?"
          defaultValue={allowGlobal ? 'global' : options[0]?.id}
          error={error?.fieldError('categoryId')}
        >
          {allowGlobal ? <option value="global">Todos los gastos (global)</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.depth > 0 ? `— ${option.name}` : option.name}
            </option>
          ))}
        </SelectField>
        <Field
          id="amount"
          label={`Límite mensual (${baseCurrency})`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ej.: 300.000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={preview.message ?? `Rige desde ${monthName} en adelante.`}
          error={
            error?.fieldError('amount') ??
            (amount !== '' && !preview.valid ? (preview.message ?? undefined) : undefined)
          }
        />
      </div>
      <div>
        <SubmitButton pending={pending}>Crear presupuesto</SubmitButton>
      </div>
    </form>
  );
}
