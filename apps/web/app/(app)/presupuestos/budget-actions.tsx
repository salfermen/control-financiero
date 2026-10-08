'use client';

import { type BudgetStatusDto, budgetStatusDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { type ApiError, apiRequest } from '@/lib/api-client';
import { amountToInput, previewAmount } from '@/lib/amount-input';
import { toApiError } from '@/lib/form-errors';
import type { Locale } from '@/lib/format';

/**
 * Cambiar el límite o quitar el presupuesto desde el mes que se está viendo.
 * Los meses anteriores conservan lo que tenían (la API crea versiones).
 */
export function BudgetActions({
  budget,
  month,
  monthName,
  locale,
}: {
  budget: BudgetStatusDto;
  month: string;
  monthName: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'edit' | 'remove'>('idle');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [amount, setAmount] = useState(amountToInput(budget.limit.amount, locale));
  const preview = previewAmount(amount, budget.limit.currency, locale);
  const startsHere = budget.validFrom === `${month}-01`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview.valid || preview.value === null) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/budgets/${budget.id}`, {
        method: 'PATCH',
        schema: budgetStatusDtoSchema,
        body: { amount: preview.value, fromMonth: month },
      });
      setMode('idle');
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/budgets/${budget.id}?fromMonth=${month}`, { method: 'DELETE' });
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setPending(false);
    }
  }

  if (mode === 'edit') {
    return (
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3" noValidate>
        {error && !error.fieldError('amount') ? <Alert>{error.message}</Alert> : null}
        <Field
          id={`amount-${budget.id}`}
          label="Nuevo límite mensual"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={
            preview.message ??
            `Desde ${monthName} en adelante; los meses anteriores conservan su límite.`
          }
          error={
            error?.fieldError('amount') ??
            (preview.valid ? undefined : (preview.message ?? undefined))
          }
        />
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button onClick={() => setMode('idle')} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-auto flex flex-col gap-2">
      {error ? <Alert>{error.message}</Alert> : null}
      {mode === 'remove' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {startsHere
              ? '¿Eliminar este presupuesto?'
              : `¿Quitarlo desde ${monthName}? Los meses anteriores lo conservan.`}
          </p>
          <Button variant="danger" onClick={() => void remove()} disabled={pending}>
            Sí, quitar
          </Button>
          <Button onClick={() => setMode('idle')} disabled={pending}>
            No
          </Button>
        </div>
      ) : (
        <div className="flex gap-4 text-sm font-medium">
          <Button variant="ghost" className="px-0" onClick={() => setMode('edit')}>
            Cambiar límite
          </Button>
          <Button variant="ghost" className="px-0" onClick={() => setMode('remove')}>
            Quitar
          </Button>
        </div>
      )}
    </div>
  );
}
