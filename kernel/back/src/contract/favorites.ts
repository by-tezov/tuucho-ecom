/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/favorites.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export interface Favorite {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  /** Variation option last viewed on a single nail with variations; `''` otherwise. */
  variationKey: string;
}
