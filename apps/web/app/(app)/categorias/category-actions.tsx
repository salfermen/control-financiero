'use client';

import { categoryDtoSchema } from '@cf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Field, SelectField } from '@/components/ui';
import { type ApiError, apiRequest } from '@/lib/api-client';
import { formText, toApiError } from '@/lib/form-errors';

interface SimpleCategory {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  parentId: string | null;
}

/**
 * Renombrar o eliminar una categoría propia. Si tiene movimientos, la API
 * pide a qué categoría moverlos (`moveTo`) antes de eliminarla.
 */
export function CategoryActions({
  category,
  alternatives,
}: {
  category: SimpleCategory;
  alternatives: SimpleCategory[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'rename' | 'remove'>('idle');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const sorted = [...alternatives].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), 'name');
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/categories/${category.id}`, {
        method: 'PATCH',
        schema: categoryDtoSchema,
        body: { name },
      });
      setMode('idle');
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const moveTo = formText(new FormData(event.currentTarget), 'moveTo');
    setPending(true);
    setError(null);
    try {
      await apiRequest(
        `/categories/${category.id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`,
        { method: 'DELETE' },
      );
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setPending(false);
    }
  }

  if (mode === 'rename') {
    return (
      <form
        onSubmit={(e) => void rename(e)}
        className="flex w-full flex-col gap-3 sm:w-auto"
        noValidate
      >
        <Field
          id={`name-${category.id}`}
          name="name"
          label="Nuevo nombre"
          defaultValue={category.name}
          maxLength={60}
          error={error?.fieldError('name') ?? error?.message}
        />
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            Guardar
          </Button>
          <Button onClick={() => setMode('idle')} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  if (mode === 'remove') {
    return (
      <form onSubmit={(e) => void remove(e)} className="flex w-full flex-col gap-3" noValidate>
        {error ? (
          <Alert>{error.fieldError('moveTo') ?? error.fieldError('id') ?? error.message}</Alert>
        ) : null}
        <SelectField
          id={`moveTo-${category.id}`}
          name="moveTo"
          label="Si tiene movimientos, muévelos a"
          defaultValue=""
          hint="Solo hace falta si la categoría tiene movimientos."
        >
          <option value="">— No tiene movimientos —</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="danger" disabled={pending}>
            Eliminar «{category.name}»
          </Button>
          <Button onClick={() => setMode('idle')} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-4 text-sm">
      <Button variant="ghost" className="px-0" onClick={() => setMode('rename')}>
        Renombrar
      </Button>
      <Button variant="ghost" className="px-0" onClick={() => setMode('remove')}>
        Eliminar
      </Button>
    </div>
  );
}
