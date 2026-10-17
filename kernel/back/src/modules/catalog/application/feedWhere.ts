import {
  effectiveQuantitySql,
  pairVisibleSql,
  productHasStockSql,
  productHasVisiblePairSql,
} from './availability.js';

export interface GalleryFeedParams {
  /** Opaque cursor from a previous page's nextCursor — omit for page 1. */
  cursor?: string;
  limit: number;
  /** One or more occasions. OR-matched within this list, same as shape/size —
   * every filter dimension combines with every other by AND. */
  occasion?: string[];
  /** One or more shapes. OR-matched within this list. */
  shape?: string[];
  /** One or more lengths (by key, e.g. `medium`/`long`/`short`). OR-matched:
   * keep sets that declare any of them under any shape — declarative
   * (product_shape_lengths), not stock-dependent, same semantics as shape. */
  length?: string[];
  /** One or more nail sizes (`XS`/`S`/`M`/`L`). OR-matched: keep sets that
   * currently have effective stock in any of the listed sizes. */
  size?: string[];
  /** Restricts the feed to exactly these ids (any order/other filters still
   * apply on top) — backs the front's "Favorites" filter, which is a
   * client-side-only concept (localStorage) with no DB column of its own. */
  ids?: string[];
  /** Set only after the caller has verified a bearer token. */
  userId?: string;
  /** Exclusive "Mes créations" filter. */
  userLibraryOnly?: boolean;
  /** Product-level stock view. `'in'` keeps only products with at least one
   * purchasable variant left, `'out'` only those with none — the gallery's
   * own switch, which defaults to `'in'` so sold-out designs stay out of
   * the way. Defaults to `'all'` here (no filter) because the same feed
   * also backs cart hydration by `ids` and the SEO relay
   * (http/seoRender.router.ts), and neither may lose a product just
   * because it sold out. */
  stock?: 'all' | 'in' | 'out';
  /** Inclusive TTC euro bounds on the set's current card price
   * (`product_prices` latest effective row). Omitted unless both are valid. */
  minPrice?: number;
  maxPrice?: number;
  /** Catalogue type for the feed. Defaults to nail sets. */
  productType?: 'nail' | 'nail_single';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves a filter parameter to the set of French labels it selects,
 * accepting either a stable catalogue key or the label itself.
 *
 * GET /gallery/filter-options now hands out keys as `value`, so a label edit
 * in catalog source no longer breaks a shared or bookmarked filter URL.
 * Labels are still accepted, so clients that cached the old option list keep
 * working unchanged.
 *
 * Matching stays on the label rather than the key because the option list
 * deduplicates by label: two keys sharing a French label are one choice to the
 * customer, and must return the union of both. Resolving key → label → all
 * keys with that label preserves exactly that. */
function labelGroupSql(table: 'shapes', paramIndex: number): string {
  return `select v.label->>'fr'
            from ${table} v
           where v.key = any($${paramIndex}::text[])
              or v.label->>'fr' = any($${paramIndex}::text[])`;
}

/** Same resolution as labelGroupSql, over shape_lengths — a length_key isn't
 * globally unique the way a shapes/colors key is (the table is keyed by
 * (shape_key, length_key), so the same length_key can carry a different
 * label per shape). The option list still dedupes it to one customer-facing
 * choice (see filterOptionsQuery.ts's dedupeByFr), so matching must resolve
 * every length_key sharing that label too, not just the literal key. */
function lengthLabelGroupSql(paramIndex: number): string {
  return `select sl.label->>'fr'
            from shape_lengths sl
           where sl.length_key = any($${paramIndex}::text[])
              or sl.label->>'fr' = any($${paramIndex}::text[])`;
}

/** Builds the shared WHERE clause + params for both the feed page query and
 * its matching count query, so "how many results for this filter" and "the
 * actual rows" can never disagree. Placeholders start at $1; returns the
 * next free placeholder index so callers can append more (cursor/limit). */
export function buildFeedWhere(
  params: Omit<GalleryFeedParams, 'cursor' | 'limit'>,
  unitOfferSql = 'false',
): {
  sql: string;
  values: unknown[];
  nextIndex: number;
} {
  const productType = params.productType === 'nail_single' ? 'nail_single' : 'nail';
  // A product whose every shape/length is hidden is hidden too
  // (docs/plans/variant-visibility.md).
  const clauses = [
    `hidden = false`,
    `product_type = '${productType}'`,
    productHasVisiblePairSql('products.id'),
  ];
  const values: unknown[] = [];

  if (params.userLibraryOnly) {
    if (productType === 'nail_single') clauses.push('false');
    else if (!params.userId) clauses.push('false');
    else {
      values.push(params.userId);
      clauses.push(
        `(audience = 'user-library' and exists (select 1 from product_user_library_users pulu where pulu.product_id = products.id and pulu.user_id = $${values.length}))`,
      );
    }
  } else if (params.userId && productType === 'nail') {
    values.push(params.userId);
    clauses.push(
      `(audience = 'public' or (audience = 'user-library' and exists (select 1 from product_user_library_users pulu where pulu.product_id = products.id and pulu.user_id = $${values.length})))`,
    );
  } else {
    clauses.push(`audience = 'public'`);
  }

  // A single nail matches when any of its options has the occasion; the
  // feed then opens the card on that option (listGalleryFeed).
  if (params.occasion && params.occasion.length > 0) {
    values.push(params.occasion);
    clauses.push(
      `(occasion->>'fr' = any($${values.length}::text[])
        or exists (
          select 1 from product_variations pvo
          where pvo.product_id = products.id
            and pvo.occasion->>'fr' = any($${values.length}::text[])
        ))`,
    );
  }

  if (params.shape && params.shape.length > 0) {
    values.push(params.shape);
    clauses.push(
      `exists (
        select 1 from product_shape_lengths gss
        join shapes s on s.key = gss.shape_key
        where gss.product_id = products.id and not gss.hidden
          and s.label->>'fr' in (${labelGroupSql('shapes', values.length)})
      )`,
    );
  }

  if (params.length && params.length.length > 0) {
    values.push(params.length);
    clauses.push(
      `exists (
        select 1 from product_shape_lengths gsl
        join shape_lengths sl on sl.shape_key = gsl.shape_key and sl.length_key = gsl.length_key
        where gsl.product_id = products.id and not gsl.hidden
          and sl.label->>'fr' in (${lengthLabelGroupSql(values.length)})
      )`,
    );
  }

  if (params.size && params.size.length > 0) {
    values.push(params.size);
    clauses.push(
      `exists (
        select 1 from product_availability gsa
        where gsa.product_id = products.id
          and gsa.size = any($${values.length}::text[])
          and ${effectiveQuantitySql} > 0
          and ${pairVisibleSql('gsa')}
      )`,
    );
  }

  if (params.ids && params.ids.length > 0) {
    // Compared as uuid, not text: casting the column to text made the primary
    // key unusable for what is otherwise an exact-match lookup. Non-uuid input
    // is dropped first — `id::text = any(…)` simply failed to match it, while
    // an unfiltered `::uuid[]` cast would raise 22P02 on the whole query.
    const uuids = params.ids.filter((id) => UUID_PATTERN.test(id));
    if (uuids.length === 0) {
      clauses.push('false');
    } else {
      values.push(uuids);
      clauses.push(`id = any($${values.length}::uuid[])`);
    }
  }

  // Product-level, deliberately: a design with stock in one shape but not
  // another is still buyable, so it belongs in the in-stock view (its own
  // card hides the shapes that are gone). Only a design with nothing left
  // anywhere counts as out of stock. nail_single uses boolean offers.
  if (params.stock === 'in' || params.stock === 'out') {
    const hasStock =
      productType === 'nail_single' ? unitOfferSql : productHasStockSql('products.id');
    clauses.push(params.stock === 'in' ? hasStock : `not ${hasStock}`);
  }

  if (
    params.minPrice !== undefined &&
    params.maxPrice !== undefined &&
    Number.isFinite(params.minPrice) &&
    Number.isFinite(params.maxPrice) &&
    params.minPrice >= 0 &&
    params.maxPrice >= params.minPrice
  ) {
    values.push(params.minPrice, params.maxPrice);
    const minIdx = values.length - 1;
    const maxIdx = values.length;
    clauses.push(
      `(
        select pp.price::numeric
          from product_prices pp
         where pp.product_id = products.id and pp.effective_at <= now()
         order by pp.effective_at desc
         limit 1
      ) between $${minIdx}::numeric and $${maxIdx}::numeric`,
    );
  }

  return { sql: clauses.join(' and '), values, nextIndex: values.length + 1 };
}
