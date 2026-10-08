'use client';

import { categoryDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Field, SelectField, SubmitButton } from '@/components/ui';
import { type ApiError, apiRequest } from '@/lib/api-client';
import { formText, generalMessage, toApiError } from '@/lib/form-errors';

interface SimpleCategory {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  parentId: string | null;
}

const FIELDS = ['name', 'kind', 'parentId'] as const;

/** Crea una categoría propia, opcionalmente bajo una categoría principal del mismo tipo. */
export function CategoryCreateForm({ categories }: { categories: SimpleCategory[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const roots = categories
    .filter((c) => c.kind === kind && c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parent = formText(data, 'parentId');
    setPending(true);
    setError(null);
    try {
      await apiRequest('/categories', {
        method: 'POST',
        schema: categoryDtoSchema,
        body: { name: formText(data, 'name'), kind, parentId: parent === '' ? null : parent },
      });
      form.reset();
      setKind('expense');
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="name"
          label="Nombre"
          required
          maxLength={60}
          placeholder="Ej.: Mascotas"
          error={error?.fieldError('name')}
        />
        <SelectField
          id="kind"
          label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value === 'income' ? 'income' : 'expense')}
          error={error?.fieldError('kind')}
        >
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </SelectField>
        <SelectField
          id="parentId"
          label="Dentro de (opcional)"
          defaultValue=""
          key={kind}
          error={error?.fieldError('parentId')}
        >
          <option value="">— Es una categoría principal —</option>
          {roots.map((root) => (
            <option key={root.id} value={root.id}>
              {root.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div>
        <SubmitButton pending={pending}>Crear categoría</SubmitButton>
      </div>
    </form>
  );
}
