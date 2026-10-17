import type { Language } from '../../../utils/language.js';

export interface FilterOption {
  /** What to send back as a gallery filter parameter. Still the French label
   * for `occasion` and the size letter for `size`; for `shape` and `length`
   * it is the stable catalogue key, so a label edit in
   * pamsurin-manager no longer breaks a shared or bookmarked filter URL.
   * The feed accepts either form (see buildFeedWhere) — clients still sending
   * labels keep working. */
  value: string;
  label: string;
}

export interface FilterOptionsResult {
  occasion: FilterOption[];
  shape: FilterOption[];
  length: FilterOption[];
  size: FilterOption[];
  /** Min/max current TTC card prices across the scoped catalogue, or null when
   * no priced products exist. Drives the gallery price-range slider bounds. */
  priceRange: { min: number; max: number } | null;
  /** Boutique toggle: sold-out sets are reachable in the gallery when true. */
  outOfStockEnabled: boolean;
  /** Boutique toggle: clicking a barred size opens the made-to-order request. */
  outOfStockSizeRequestEnabled?: boolean;
}

/** Which catalogue the option lists describe. Compose-a-set uses nail_single. */
export type FilterOptionsProductType = 'nail' | 'nail_single';

type FilterOptionsCacheKey = `${Language}:${'all' | 'in'}:${FilterOptionsProductType}`;

let filterOptionsCache: Partial<Record<FilterOptionsCacheKey, FilterOptionsResult>> = {};

function cacheKey(
  language: Language,
  inStockOnly: boolean,
  productType: FilterOptionsProductType,
): FilterOptionsCacheKey {
  return `${language}:${inStockOnly ? 'in' : 'all'}:${productType}`;
}

export function readFilterOptionsCache(
  language: Language,
  inStockOnly: boolean,
  productType: FilterOptionsProductType = 'nail',
): FilterOptionsResult | undefined {
  return filterOptionsCache[cacheKey(language, inStockOnly, productType)];
}

export function writeFilterOptionsCache(
  language: Language,
  inStockOnly: boolean,
  productType: FilterOptionsProductType,
  options: FilterOptionsResult,
): void {
  filterOptionsCache[cacheKey(language, inStockOnly, productType)] = options;
}

export function invalidateFilterOptionsCache(): void {
  filterOptionsCache = {};
}
