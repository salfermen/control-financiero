import { addMonths, localDateInTimeZone, monthRange, yearMonthOf } from '@cf/domain';
import { budgetsMonthDtoSchema, categoryDtoSchema, listOf, yearMonthSchema } from '@cf/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BudgetBar } from '@/components/budget-bar';
import { Card, EmptyState, PageHeader, linkButtonClass } from '@/components/ui';
import { formatMonth } from '@/lib/format';
import { categoryOptions } from '@/lib/labels';
import { serverApi } from '@/lib/server-api';
import { getSession } from '@/lib/server-session';
import { BudgetActions } from './budget-actions';
import { BudgetCreateForm } from './budget-create-form';

export const metadata: Metadata = { title: 'Presupuestos' };
export const dynamic = 'force-dynamic';

/**
 * Presupuestos de un mes. El estado de cada uno (gastado, programado, nivel
 * y ritmo) lo calcula el Financial Engine; aquí solo se muestra y se edita.
 */
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/ingresar');
  const { settings } = session.user;
  const locale = settings.locale;
  const today = localDateInTimeZone(new Date(), settings.timezone);
  const month = yearMonthSchema.safeParse((await searchParams).mes).data ?? yearMonthOf(today);
  const range = monthRange(month);

  const [state, categories] = await Promise.all([
    serverApi(`/budgets?month=${month}`, budgetsMonthDtoSchema),
    serverApi('/categories', listOf(categoryDtoSchema)),
  ]);
  const budgeted = new Set(state.budgets.map((b) => b.categoryId ?? 'global'));
  const options = categoryOptions(categories.data, 'expense')
    .filter(({ category }) => !budgeted.has(category.id))
    .map(({ category, depth }) => ({ id: category.id, name: category.name, depth }));
  const previous = yearMonthOf(addMonths(range.from, -1));
  const next = yearMonthOf(addMonths(range.from, 1));
  const monthName = formatMonth(month, locale);

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Límites mensuales de gasto. Te avisamos al llegar al 75 %, 90 % y 100 % de lo comprometido (lo gastado más lo programado)."
        action={
          <Link href="/categorias" className={linkButtonClass.secondary}>
            Categorías
          </Link>
        }
      />

      <nav aria-label="Mes" className="flex items-center gap-2">
        <Link
          href={`/presupuestos?mes=${previous}`}
          className={linkButtonClass.secondary}
          aria-label="Mes anterior"
        >
          ‹
        </Link>
        <h2 className="min-w-44 text-center text-lg font-semibold first-letter:uppercase">
          {monthName}
        </h2>
        <Link
          href={`/presupuestos?mes=${next}`}
          className={linkButtonClass.secondary}
          aria-label="Mes siguiente"
        >
          ›
        </Link>
      </nav>

      {state.budgets.length === 0 ? (
        <EmptyState title={`Sin presupuestos en ${monthName}`}>
          Crea uno global (todos tus gastos) o por categoría. Una categoría incluye sus
          subcategorías: «Entretenimiento» cuenta también «Videojuegos». Rige desde este mes en
          adelante hasta que lo cambies.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {state.budgets.map((budget) => (
            <li key={budget.id}>
              <Card className="flex h-full flex-col gap-4">
                <BudgetBar budget={budget} locale={locale} />
                <BudgetActions
                  budget={budget}
                  month={month}
                  monthName={monthName}
                  locale={locale}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Nuevo presupuesto</h2>
        <BudgetCreateForm
          locale={locale}
          month={month}
          monthName={monthName}
          baseCurrency={state.baseCurrency}
          allowGlobal={!budgeted.has('global')}
          options={options}
        />
      </Card>
      <p className="text-xs text-text-muted">
        Cuentan gastos y comisiones en {state.baseCurrency} (a la tasa del día de cada compra); los
        reembolsos los reducen. Transferencias entre tus cuentas y pagos de tarjeta no son gasto. La
        estimación «al ritmo actual» es una proyección, no un hecho.
      </p>
    </>
  );
}
