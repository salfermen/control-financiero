import { describe, expect, it } from 'vitest';
import { categoryOptions, rateSourceLabel } from './labels';

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
});
