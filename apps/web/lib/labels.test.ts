import { describe, expect, it } from 'vitest';
import { BUDGET_LEVELS_UI, barWidth, categoryOptions, rateSourceLabel } from './labels';

describe('etiquetas', () => {
  it('nombra las fuentes de tasas', () => {
    expect(rateSourceLabel('superfinanciera-trm')).toContain('Superintendencia');
    expect(rateSourceLabel('ecb + manual')).toBe('ecb + tasa escrita por ti');
  });

  it('ordena categorías con subcategorías bajo su padre', () => {
    const categories = [
      { id: 'g', name: 'Videojuegos', kind: 'expense', parentId: 'e' },
      { id: 'e', name: 'Entretenimiento', kind: 'expense', parentId: null },
      { id: 'a', name: 'Alimentación', kind: 'expense', parentId: null },
      { id: 's', name: 'Sueldo', kind: 'income', parentId: null },
    ] as const;
    expect(categoryOptions(categories, 'expense').map((o) => [o.category.name, o.depth])).toEqual([
      ['Alimentación', 0],
      ['Entretenimiento', 0],
      ['Videojuegos', 1],
    ]);
  });

  it('convierte proporciones del motor en anchos de barra acotados', () => {
    expect(barWidth('0.7667')).toBe(76.7);
    expect(barWidth('1.0400')).toBe(100);
    expect(barWidth('0.0000')).toBe(0);
    expect(barWidth('-0.2000')).toBe(0);
    expect(barWidth('no')).toBe(0);
  });

  it('cada nivel de presupuesto tiene etiqueta y color', () => {
    expect(BUDGET_LEVELS_UI.exceeded).toMatchObject({ label: 'Superado', bar: 'bg-danger' });
    expect(Object.keys(BUDGET_LEVELS_UI)).toEqual(['ok', 'notice', 'warning', 'exceeded']);
  });
});
