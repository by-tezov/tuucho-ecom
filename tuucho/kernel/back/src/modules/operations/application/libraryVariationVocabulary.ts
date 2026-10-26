import type pg from 'pg';
import { withTransaction } from '../../../platform/db/transaction.js';
import type { PartialTrilingual } from '../../../types.js';

/** One variation axis of the vocabulary: its title and its options, in
 * display order (the order becomes `variation_options.sort_order`). */
export interface VariationAxisVocabularyEntry {
  title: PartialTrilingual;
  options: Array<{ key: string; title: PartialTrilingual }>;
}

/**
 * Upserts the `variation` table of catalog source's layered
 * data-common.json (see tuucho/docs/plans/nail-variations.md) into
 * `variation_axes` / `variation_options`. `$table.key` references are
 * resolved by the caller (scripts/library.ts): only plain translations
 * arrive here.
 *
 * `deleteMissing` removes axes, and options of a listed axis, that the payload
 * no longer names; the cascade then drops them from every product that used
 * them. Order snapshots keep their copied labels.
 */
export async function syncVariationVocabulary(
  pool: pg.Pool,
  axes: Record<string, VariationAxisVocabularyEntry>,
  deleteMissing: boolean,
): Promise<{ variationAxes: number; variationOptions: number; deletedVariations: string[] }> {
  return withTransaction(pool, async (client) => {
    let optionCount = 0;
    const deleted: string[] = [];
    for (const [axisKey, axis] of Object.entries(axes)) {
      await client.query(
        `insert into variation_axes (key, title) values ($1, $2)
         on conflict (key) do update set title = excluded.title`,
        [axisKey, axis.title],
      );
      for (const [index, option] of axis.options.entries()) {
        await client.query(
          `insert into variation_options (axis_key, option_key, title, sort_order) values ($1, $2, $3, $4)
           on conflict (axis_key, option_key) do update set title = excluded.title, sort_order = excluded.sort_order`,
          [axisKey, option.key, option.title, index],
        );
        optionCount += 1;
      }
      if (deleteMissing) {
        const { rows } = await client.query<{ option_key: string }>(
          `delete from variation_options where axis_key = $1 and option_key <> all($2::text[]) returning option_key`,
          [axisKey, axis.options.map((option) => option.key)],
        );
        deleted.push(...rows.map((row) => `${axisKey}.${row.option_key}`));
      }
    }
    if (deleteMissing) {
      const { rows } = await client.query<{ key: string }>(
        `delete from variation_axes where key <> all($1::text[]) returning key`,
        [Object.keys(axes)],
      );
      deleted.push(...rows.map((row) => row.key));
    }
    return {
      variationAxes: Object.keys(axes).length,
      variationOptions: optionCount,
      deletedVariations: deleted,
    };
  });
}

/** Parses the wire form `{ <axis>: { title, options: [{ key, title }] } }`,
 * dropping any entry whose titles are not translations. */
export function parseVariationVocabulary(
  raw: unknown,
  isTranslation: (value: unknown) => value is PartialTrilingual,
): Record<string, VariationAxisVocabularyEntry> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const axes: Record<string, VariationAxisVocabularyEntry> = {};
  for (const [axisKey, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!axisKey || !entry || typeof entry !== 'object') continue;
    const { title, options } = entry as { title?: unknown; options?: unknown };
    if (!isTranslation(title) || !Array.isArray(options)) continue;
    const parsed = options.flatMap((option) => {
      if (!option || typeof option !== 'object') return [];
      const { key, title: optionTitle } = option as { key?: unknown; title?: unknown };
      return typeof key === 'string' && key.length > 0 && isTranslation(optionTitle)
        ? [{ key, title: optionTitle }]
        : [];
    });
    axes[axisKey] = { title, options: parsed };
  }
  return axes;
}
