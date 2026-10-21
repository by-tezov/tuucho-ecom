/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/gallery.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */
import type { GalleryItem } from './gallery-data.js';

export interface GalleryFeedParams {
  cursor?: string;
  limit?: number;
  /** One or more occasions — OR-matched, same as size/shape below. Every
   * filter dimension combines with every other by AND. */
  occasion?: string[];
  /** One or more shapes — OR-matched. */
  shape?: string[];
  /** One or more length keys (e.g. `medium`/`long`/`short`) — OR-matched,
   * declarative (any shape declaring it), not stock-dependent. */
  length?: string[];
  /** One or more of `XS`/`S`/`M`/`L` — OR-matched against in-stock sizes. */
  size?: string[];
  /** Restricts to exactly these ids — backs the Favorites filter. */
  ids?: string[];
  userLibraryOnly?: boolean;
  /** Product-level stock view — `'in'` hides sold-out designs, `'out'`
   * shows only those, `'all'` (or omitted) shows both. Omit for cart
   * hydration by `ids`: a line that just sold out must still resolve
   * to its product. Only the gallery grid sends this. */
  stock?: 'in' | 'out' | 'all';
  /** Inclusive TTC euro bounds on each set's current card price. Omit when
   * the filter is inactive (full catalogue range). */
  minPrice?: number;
  maxPrice?: number;
}

export interface GalleryFeedResult {
  items: GalleryItem[];
  nextCursor: string | null;
  totalCount: number;
  hasUserLibraryItems?: boolean;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptionsResult {
  occasion: FilterOption[];
  shape: FilterOption[];
  /** Present once the API serves length options; older backends omit it. */
  length?: FilterOption[];
  /** Present once the API serves size options; older backends omit it. */
  size?: FilterOption[];
  /** Catalogue-wide nail price bounds; null when no priced public nails. */
  priceRange?: { min: number; max: number } | null;
  /** Boutique toggle. Missing on older backends — treat as true. */
  outOfStockEnabled?: boolean;
  /** Boutique toggle for clicking barred sizes. Missing on older backends — treat as true. */
  outOfStockSizeRequestEnabled?: boolean;
}

export type ProductHydrationType = 'nail' | 'accessory';

/** Minimal product fields for cart hydration (nails + accessories).
 * `available` is a shape→length→size map for nails (the same shape as
 * GalleryItem.available, so availableQuantityFor reads either) and a scalar
 * for accessories. This was previously declared one level too shallow, which
 * hid the fact that /gallery/products already carries full nail stock and led
 * the cart surfaces to chain a second /gallery/feed request just to get it —
 * see kernel/back's products.service.ts (returns SetAvailability) . */
export interface ProductById {
  id: string;
  productType: ProductHydrationType;
  productUid: string;
  title: string;
  desc: string;
  price: number | Record<string, number> | undefined;
  photo: string | null;
  available: Record<string, Record<string, Partial<Record<'XS' | 'S' | 'M' | 'L', number>>>> | number;
  accessoryType?: 'default' | 'byQuantity';
  packs?: Record<string, number>;
  packLabels?: Record<string, string>;
  photosByPack?: Record<string, string[]>;
  inCartCarousel?: boolean;
}

export type CartRuleKind = 'gift_per_nail_set' | 'nail_qty_percent_tiers' | 'free_shipping_above';

export interface PublicCartRule {
  code: string;
  kind: CartRuleKind;
  priority: number;
  forbidVoucher: boolean;
  params: unknown;
  /** Resolved gift product id, provided only for a valid gift rule. */
  giftProductId?: string;
}
