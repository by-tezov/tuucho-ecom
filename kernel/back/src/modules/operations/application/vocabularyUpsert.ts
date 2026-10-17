import type pg from 'pg';
import type { PartialTrilingual } from '../../../types.js';
import type { ShapeVocabularyEntry } from '../domain/vocabulary.js';

/**
 * Writing the shared shape/colour vocabulary, split out of libraryImport.ts:
 * it is the only part that knows the column layout of `shapes`,
 * `shape_lengths` and `colors`, and it grew a second and a third per-language
 * field (`gender`, `attributive`) that the set importer has no interest in.
 */

/** Upserts the shapes/colors vocabulary from catalog source's
 * data-common.json — same "insert or update the label" semantics as the
 * old direct-DB script, just reachable over HTTP now. Safe to re-run. */
export async function upsertVocabulary(
  client: pg.Pool | pg.PoolClient,
  shapes: Record<string, ShapeVocabularyEntry>,
  colors: Record<string, PartialTrilingual>,
): Promise<{ shapes: number; colors: number }> {
  for (const [key, entry] of Object.entries(shapes)) {
    await client.query(
      `insert into shapes (key, label, gender, attributive) values ($1, $2, $3, $4)
       on conflict (key) do update set label = excluded.label, gender = excluded.gender,
         attributive = excluded.attributive`,
      [key, entry.title, entry.gender ?? {}, entry.attributive ?? {}],
    );
    // Lengths this shape no longer declares go first: product_shape_lengths
    // cascades off them, so a length dropped from the vocabulary correctly
    // stops being sellable. Shapes/lengths still in use are protected by
    // that same FK, which errors loudly rather than silently orphaning.
    await client.query('delete from shape_lengths where shape_key = $1 and length_key <> all($2::text[])', [
      key,
      Object.keys(entry.length),
    ]);
    for (const [lengthKey, length] of Object.entries(entry.length)) {
      await client.query(
        `insert into shape_lengths (shape_key, length_key, value, label, gender) values ($1, $2, $3, $4, $5)
         on conflict (shape_key, length_key) do update set value = excluded.value, label = excluded.label,
           gender = excluded.gender`,
        [key, lengthKey, length.value, length.title, length.gender ?? {}],
      );
    }
  }
  for (const [key, label] of Object.entries(colors)) {
    await client.query(
      'insert into colors (key, label) values ($1, $2) on conflict (key) do update set label = excluded.label',
      [key, label],
    );
  }
  return { shapes: Object.keys(shapes).length, colors: Object.keys(colors).length };
}
