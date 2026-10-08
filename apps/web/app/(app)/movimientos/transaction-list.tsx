'use client';

import { type TransactionDto, type TransactionListDto, transactionListDtoSchema } from '@cf/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, EmptyState } from '@/components/ui';
import { apiRequest } from '@/lib/api-client';
import { toApiError } from '@/lib/form-errors';
import { TRANSACTION_TYPE_LABELS, type Locale, formatDate, money, signedMoney } from '@/lib/format';

interface Props {
  locale: Locale;
  initial: TransactionListDto;
  /** Filtros ya aplicados (from, to, accountId, limit). */
  query: string;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

/** Lista de movimientos agrupada por día, con «Cargar más» por cursor. */
export function TransactionList({ locale, initial, query, accounts, categories }: Props) {
  const [items, setItems] = useState(initial.data);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await apiRequest(`/transactions?${query}&cursor=${encodeURIComponent(cursor)}`, {
        schema: transactionListDtoSchema,
      });
      setItems((current) => [...current, ...page.data]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState title="No hay movimientos en este mes">
        Registra tus gastos e ingresos para ver aquí en qué se va tu dinero.
      </EmptyState>
    );
  }

  const days = new Map<string, TransactionDto[]>();
  for (const item of items) {
    days.set(item.transactionDate, [...(days.get(item.transactionDate) ?? []), item]);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...days.entries()].map(([day, entries]) => (
        <section key={day} aria-label={formatDate(day, locale, 'long')}>
          <h3 className="mb-2 text-sm font-medium text-text-muted first-letter:uppercase">
            {formatDate(day, locale, 'long')}
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {entries.map((tx) => {
              const neutral = tx.type === 'transfer' || tx.type === 'payment';
              const counterpart = tx.counterpartAccountId
                ? accountName.get(tx.counterpartAccountId)
                : undefined;
              return (
                <li key={tx.id}>
                  <Link
                    href={`/movimientos/${tx.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tx.description}</p>
                      <p className="truncate text-xs text-text-muted">
                        {neutral || tx.type === 'refund' || tx.type === 'fee'
                          ? TRANSACTION_TYPE_LABELS[tx.type]
                          : tx.categoryId
                            ? categoryName.get(tx.categoryId)
                            : 'Sin categoría'}
                        {' · '}
                        {accountName.get(tx.accountId) ?? 'Cuenta'}
                        {counterpart
                          ? tx.direction === 'outflow'
                            ? ` → ${counterpart}`
                            : ` ← ${counterpart}`
                          : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tx.status === 'pending' ? <Badge tone="warning">Pendiente</Badge> : null}
                        {tx.original.currency !== tx.amount.currency ? (
                          <Badge title="Monto original del comercio">
                            {money(tx.original, locale)}
                          </Badge>
                        ) : null}
                        {tx.fx?.estimated ? (
                          <Badge
                            tone="accent"
                            title="Convertido con una tasa, no con el valor cobrado"
                          >
                            ≈ estimado
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <p
                      className={`shrink-0 font-semibold tabular-nums ${neutral ? 'text-text-muted' : tx.direction === 'inflow' ? 'text-positive' : ''}`}
                    >
                      {signedMoney(tx.amount, tx.direction, locale)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {error ? <Alert>{error}</Alert> : null}
      {cursor ? (
        <Button onClick={() => void loadMore()} disabled={loading} className="self-center">
          {loading ? 'Cargando…' : 'Cargar más'}
        </Button>
      ) : null}
    </div>
  );
}
