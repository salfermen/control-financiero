import { type CategoryDto, categoryDtoSchema, listOf } from '@cf/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, PageHeader } from '@/components/ui';
import { categoryOptions } from '@/lib/labels';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { CategoryActions } from './category-actions';
import { CategoryCreateForm } from './category-create-form';

export const metadata: Metadata = { title: 'Categorías' };
export const dynamic = 'force-dynamic';

const KINDS = [
  { kind: 'expense', title: 'Gastos' },
  { kind: 'income', title: 'Ingresos' },
] as const;

/** Categorías del sistema (solo lectura) y propias (crear, renombrar, eliminar). */
export default async function CategoriesPage() {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { data: categories } = await serverApi('/categories', listOf(categoryDtoSchema));

  const simple = (c: CategoryDto) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
  });
  return (
    <>
      <PageHeader
        title="Categorías"
        description="Las del sistema no se pueden cambiar. Crea las tuyas, también como subcategoría de una principal: los presupuestos de la principal las incluyen."
      />
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Nueva categoría</h2>
        <CategoryCreateForm categories={categories.map(simple)} />
      </Card>
      {KINDS.map(({ kind, title }) => {
        const options = categoryOptions(categories, kind);
        return (
          <section key={kind} aria-labelledby={`cat-${kind}`} className="flex flex-col gap-3">
            <h2 id={`cat-${kind}`} className="text-lg font-semibold">
              {title}
            </h2>
            <div className="rounded-2xl border border-border bg-surface shadow-sm">
              <ul className="divide-y divide-border">
                {options.map(({ category, depth }) => (
                  <li
                    key={category.id}
                    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 sm:px-6 ${depth > 0 ? 'pl-10 sm:pl-12' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {depth > 0 ? (
                        <span aria-hidden className="text-text-muted">
                          ↳
                        </span>
                      ) : null}
                      <span className="font-medium">{category.name}</span>
                      {category.isSystem ? (
                        <Badge>Del sistema</Badge>
                      ) : (
                        <Badge tone="accent">Tuya</Badge>
                      )}
                    </div>
                    {category.isSystem ? null : (
                      <CategoryActions
                        category={simple(category)}
                        alternatives={categories
                          .filter((c) => c.kind === kind && c.id !== category.id)
                          .map(simple)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </>
  );
}
