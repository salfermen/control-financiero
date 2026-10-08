/** Nombres legibles de las fuentes de tasas guardadas en `exchange_rates.source`. */
const RATE_SOURCES: Record<string, string> = {
  'superfinanciera-trm': 'Superintendencia Financiera (datos.gov.co)',
  manual: 'tasa escrita por ti',
  settled: 'valor cobrado por el banco',
};

export function rateSourceLabel(source: string): string {
  return source
    .split(' + ')
    .map((part) => RATE_SOURCES[part] ?? part)
    .join(' + ');
}

interface CategoryLike {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  parentId: string | null;
}

/** Categorías de un tipo, padres primero y cada subcategoría bajo su padre. */
export function categoryOptions<T extends CategoryLike>(
  categories: readonly T[],
  kind: 'income' | 'expense',
): { category: T; depth: number }[] {
  const ofKind = categories.filter((c) => c.kind === kind);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'es');
  const roots = ofKind.filter((c) => !c.parentId || !ofKind.some((p) => p.id === c.parentId));
  return roots.sort(byName).flatMap((root) => [
    { category: root, depth: 0 },
    ...ofKind
      .filter((c) => c.parentId === root.id)
      .sort(byName)
      .map((category) => ({ category, depth: 1 })),
  ]);
}
