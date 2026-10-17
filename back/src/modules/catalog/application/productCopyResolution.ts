import type pg from 'pg';
import type { PartialTrilingual } from '../../../types.js';
import { LANGUAGES, localize, type Language } from '../../../utils/language.js';
import { resolveProductCopy, type CopyContext } from '../domain/productCopy.js';
import { readGender, type ShapeLengthVocabularyRow, type ShapeVocabularyRow } from './productVariants.js';

/**
 * Placeholder resolution for every surface that shows a set's authored
 * `desc`/`alt` outside the gallery assembly: order lines (and the snapshot
 * written at checkout), the cart, the server-rendered SEO index.
 *
 * Why it exists: `products."desc"` and `alt` hold templates (`$Shape.title`,
 * `$g{...}`, see productCopy.ts). The gallery resolves them against the set's
 * own shape vocabulary, but any other reader that only localizes the column
 * shows the raw tokens to a customer.
 *
 * The vocabulary (`shapes`, `shape_lengths`) is a few dozen rows, so it is
 * read whole and kept for a short while instead of joined into every query.
 */

export interface CopyVocabulary {
  shapes: Map<string, ShapeVocabularyRow>;
  /** Keyed `${shape_key}|${length_key}`. */
  lengths: Map<string, ShapeLengthVocabularyRow>;
}

type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

const CACHE_MS = 60_000;
let cached: { at: number; value: Promise<CopyVocabulary> } | null = null;

export function loadCopyVocabulary(client: Queryable): Promise<CopyVocabulary> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = (async () => {
    const [{ rows: shapeRows }, { rows: lengthRows }] = await Promise.all([
      client.query<ShapeVocabularyRow>('select key as shape_key, label, gender, attributive from shapes'),
      client.query<ShapeLengthVocabularyRow>(
        'select shape_key, length_key, label, gender from shape_lengths',
      ),
    ]);
    return {
      shapes: new Map(shapeRows.map((row) => [row.shape_key, row])),
      lengths: new Map(lengthRows.map((row) => [`${row.shape_key}|${row.length_key}`, row])),
    };
  })();
  cached = { at: now, value };
  // A failed read must not be served from the cache for the next minute.
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

/** The copy context of one shape/length pair in one language. A key the
 * vocabulary does not know (an accessory, a retired shape) resolves its
 * tokens to nothing rather than leaving them in the text. */
export function copyContextFor(
  vocabulary: CopyVocabulary,
  shapeKey: string | null | undefined,
  lengthKey: string | null | undefined,
  language: Language,
): CopyContext {
  const shape = shapeKey ? vocabulary.shapes.get(shapeKey) : undefined;
  if (!shape) return {};
  const label = localize(shape.label, language);
  const length = lengthKey ? vocabulary.lengths.get(`${shapeKey}|${lengthKey}`) : undefined;
  return {
    shape: {
      label,
      gender: readGender(shape.gender, language),
      attributive: (shape.attributive ? localize(shape.attributive, language) : '') || label,
    },
    ...(length
      ? { length: { label: localize(length.label, language), gender: readGender(length.gender, language) } }
      : {}),
  };
}

/** Localizes and resolves one authored string for display. */
export function resolveLocalizedCopy(
  text: PartialTrilingual,
  vocabulary: CopyVocabulary,
  shapeKey: string | null | undefined,
  lengthKey: string | null | undefined,
  language: Language,
): string {
  return resolveProductCopy(
    localize(text, language),
    copyContextFor(vocabulary, shapeKey, lengthKey, language),
  );
}

/** Resolves every language of an authored string, each against its own
 * vocabulary: the shape a checkout line was bought in, frozen into the order
 * snapshot. */
export function resolveTrilingualCopy(
  text: PartialTrilingual,
  vocabulary: CopyVocabulary,
  shapeKey: string | null | undefined,
  lengthKey: string | null | undefined,
): PartialTrilingual {
  const resolved: PartialTrilingual = { fr: '' };
  for (const language of LANGUAGES) {
    const value = text[language];
    if (value === undefined) continue;
    resolved[language] = resolveProductCopy(value, copyContextFor(vocabulary, shapeKey, lengthKey, language));
  }
  return resolved;
}

/** The shape and length each set is described by when nothing selects one:
 * its first visible shape and that shape's first visible length, the same
 * default the gallery's defaultCopyContext applies. */
export async function loadDefaultShapeLengths(
  client: Queryable,
  productIds: string[],
): Promise<Map<string, { shapeKey: string; lengthKey: string }>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await client.query<{ product_id: string; shape_key: string; length_key: string }>(
    `select distinct on (ps.product_id) ps.product_id, ps.shape_key, psl.length_key
     from product_shapes ps
     join product_shape_lengths psl
       on psl.product_id = ps.product_id and psl.shape_key = ps.shape_key and not psl.hidden
     where ps.product_id = any($1::uuid[])
     order by ps.product_id, ps.sort_order, psl.sort_order`,
    [productIds],
  );
  return new Map(rows.map((row) => [row.product_id, { shapeKey: row.shape_key, lengthKey: row.length_key }]));
}

/** Resolves a set's copy against its default shape/length, for surfaces that
 * show a set without a selected shape (cart hydration, the SEO index). */
export type DefaultCopyResolver = (productId: string, text: PartialTrilingual, language: Language) => string;

export async function loadDefaultCopyResolver(
  client: Queryable,
  productIds: string[],
): Promise<DefaultCopyResolver> {
  const [vocabulary, defaults] = await Promise.all([
    loadCopyVocabulary(client),
    loadDefaultShapeLengths(client, productIds),
  ]);
  return (productId, text, language) => {
    const pair = defaults.get(productId);
    return resolveLocalizedCopy(text, vocabulary, pair?.shapeKey, pair?.lengthKey, language);
  };
}

/** Resolves an order line's copy, in every language, against the shape and
 * length the line was bought in. */
export type OrderCopyResolver = (
  text: PartialTrilingual,
  shapeKey: string | null | undefined,
  lengthKey: string | null | undefined,
) => PartialTrilingual;

export async function loadOrderCopyResolver(client: Queryable): Promise<OrderCopyResolver> {
  const vocabulary = await loadCopyVocabulary(client);
  return (text, shapeKey, lengthKey) => resolveTrilingualCopy(text, vocabulary, shapeKey, lengthKey);
}
