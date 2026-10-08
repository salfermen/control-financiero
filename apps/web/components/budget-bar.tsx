import type { BudgetStatusDto } from '@cf/shared';
import { formatPercent } from '@cf/domain';
import { Badge } from '@/components/ui';
import { type Locale, absMoney, isZero, money } from '@/lib/format';
import { BUDGET_LEVELS_UI, barWidth } from '@/lib/labels';

/**
 * Barra de un presupuesto: lo gastado en color sólido y lo programado en el
 * mismo color atenuado. Todos los números vienen calculados por el motor.
 */
export function BudgetBar({
  budget,
  locale,
  compact = false,
}: {
  budget: BudgetStatusDto;
  locale: Locale;
  compact?: boolean;
}) {
  const level = BUDGET_LEVELS_UI[budget.level];
  const spent = barWidth(budget.spentRatio);
  const committed = barWidth(budget.usedRatio);
  const name = budget.categoryName ?? 'Todos los gastos';
  const percent = formatPercent(budget.usedRatio, { locale, decimals: 0 });
  const over = budget.level === 'exceeded';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">
          {name}
          {budget.subcategoryCount > 0 && !compact ? (
            <span className="text-xs font-normal text-text-muted">
              {' '}
              · incluye {budget.subcategoryCount} subcategoría(s)
            </span>
          ) : null}
        </p>
        <Badge tone={level.badge} title={level.label}>
          {percent}
        </Badge>
      </div>
      <div
        role="progressbar"
        aria-label={`${name}: ${percent} del presupuesto comprometido`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(committed)}
        className="relative h-2.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`absolute inset-y-0 left-0 opacity-40 ${level.bar}`}
          style={{ width: `${committed}%` }}
        />
        <div className={`absolute inset-y-0 left-0 ${level.bar}`} style={{ width: `${spent}%` }} />
      </div>
      <p className="text-xs text-text-muted">
        {money(budget.spent, locale)} gastado
        {!isZero(budget.scheduled)
          ? ` + ${money(budget.scheduled, locale)} programado`
          : ''} de {money(budget.limit, locale)} ·{' '}
        <span className={over ? 'font-medium text-danger' : ''}>
          {over
            ? `te pasaste por ${absMoney(budget.remaining, locale)}`
            : `quedan ${money(budget.remaining, locale)}`}
        </span>
      </p>
      {budget.pace?.exceedsLimit && !over && !compact ? (
        <p className="text-xs text-warning">
          Estimación: al ritmo actual cerrarías el mes en{' '}
          {money(budget.pace.projectedClose, locale)}, por encima del límite.
        </p>
      ) : null}
    </div>
  );
}
