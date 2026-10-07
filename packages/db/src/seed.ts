import { CURRENCIES, SYSTEM_CATEGORIES } from '@cf/domain';
import { isNull, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { categories, currencies } from './schema/index.js';

export interface SeedResult {
  currencies: number;
  categories: number;
}

/**
 * Siembra los datos de referencia (monedas y categorías del sistema).
 *
 * Es idempotente: se puede ejecutar en cada despliegue. Inserta lo que falta y
 * actualiza nombres y decimales de lo existente; nunca borra filas, porque
 * pueden estar referenciadas por movimientos del usuario.
 *
 * NO crea datos de usuario de ejemplo: la plataforma no usa datos ficticios.
 */
export async function seedReferenceData(db: Database): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await tx
      .insert(currencies)
      .values(
        CURRENCIES.map((c) => ({
          code: c.code,
          nameEs: c.nameEs,
          nameEn: c.nameEn,
          minorUnit: c.minorUnit,
          displayDecimals: c.displayDecimals,
        })),
      )
      .onConflictDoUpdate({
        target: currencies.code,
        set: {
          nameEs: sql`excluded.name_es`,
          nameEn: sql`excluded.name_en`,
          minorUnit: sql`excluded.minor_unit`,
          displayDecimals: sql`excluded.display_decimals`,
          updatedAt: sql`now()`,
        },
      });

    // Primero las categorías raíz y luego las hijas, para resolver `parent_id`.
    const roots = SYSTEM_CATEGORIES.filter((c) => c.parentKey === undefined);
    const children = SYSTEM_CATEGORIES.filter((c) => c.parentKey !== undefined);

    const upsert = (rows: (typeof categories.$inferInsert)[]) =>
      tx
        .insert(categories)
        .values(rows)
        .onConflictDoUpdate({
          target: categories.systemKey,
          set: {
            name: sql`excluded.name`,
            kind: sql`excluded.kind`,
            parentId: sql`excluded.parent_id`,
            updatedAt: sql`now()`,
          },
        });

    await upsert(roots.map((c) => ({ systemKey: c.key, kind: c.kind, name: c.nameEs })));

    const existing = await tx
      .select({ id: categories.id, systemKey: categories.systemKey })
      .from(categories)
      .where(isNull(categories.userId));
    const idByKey = new Map(existing.map((row) => [row.systemKey, row.id]));

    if (children.length > 0) {
      await upsert(
        children.map((c) => {
          const parentId = idByKey.get(c.parentKey ?? '');
          if (!parentId) {
            throw new Error(`Categoría padre inexistente: ${c.parentKey ?? ''}`);
          }
          return { systemKey: c.key, kind: c.kind, name: c.nameEs, parentId };
        }),
      );
    }

    return { currencies: CURRENCIES.length, categories: SYSTEM_CATEGORIES.length };
  });
}
