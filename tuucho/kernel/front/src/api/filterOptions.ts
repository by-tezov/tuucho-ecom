import { fetchFilterOptions } from './gallery';
import { getReceiverGalleryFilters } from './gift';
import { pickLang } from '../assets/i18n/pickLang';
import { filterAllLabel } from '../data/filters';
import type { FilterCategory } from '../data/types';
import type { Lang } from '../assets/i18n';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptionsData {
  filterOptions: Record<FilterCategory, FilterOption[]>;
  filterOptionLabel: Record<FilterCategory, Record<string, string>>;
  priceCatalogue: { min: number; max: number } | null;
  /** Boutique toggle. Missing/older backends keep the sold-out gallery view. */
  outOfStockEnabled: boolean;
  /** Boutique toggle. Missing/older backends keep the size-request click. */
  outOfStockSizeRequestEnabled: boolean;
}

function withAll(category: FilterCategory, options: FilterOption[], lang: Lang): FilterOption[] {
  return [{ value: 'all', label: pickLang(filterAllLabel[category], lang) }, ...options];
}

function buildFilterOptionsData(
  apiResult: Awaited<ReturnType<typeof fetchFilterOptions>>,
  lang: Lang,
): FilterOptionsData {
  const filterOptions: Record<FilterCategory, FilterOption[]> = {
    occasion: withAll('occasion', apiResult.occasion, lang),
    shape: withAll('shape', apiResult.shape, lang),
    length: withAll('length', apiResult.length ?? [], lang),
    size: withAll('size', apiResult.size ?? [], lang),
  };

  const filterOptionLabel = Object.fromEntries(
    (Object.keys(filterOptions) as FilterCategory[]).map((category) => [
      category,
      Object.fromEntries(filterOptions[category].map((option) => [option.value, option.label])),
    ]),
  ) as Record<FilterCategory, Record<string, string>>;

  return {
    filterOptions,
    filterOptionLabel,
    priceCatalogue: apiResult.priceRange ?? null,
    outOfStockEnabled: apiResult.outOfStockEnabled !== false,
    outOfStockSizeRequestEnabled: apiResult.outOfStockSizeRequestEnabled !== false,
  };
}

/**
 * Filter option values are no longer derived from a full in-memory item
 * list (see the old buildDynamicOptions here) — kernel/back's
 * GET /api/gallery/filter-options already does that scan server-side and
 * returns the distinct values in use.
 *
 * Fetched lazily, client-side only, the first time something actually needs
 * it (see useFilterOptions.ts) — never at module load. A module-level
 * top-level `await fetchFilterOptions()` used to sit here instead, but
 * that's exactly the "old" pattern gallery.ts's own comment says was
 * abandoned: an eagerly-evaluated ES module import runs the instant
 * anything imports this file, including kernel/back never even being up
 * — e.g. scripts/prerender.mjs importing the SSR bundle at build time,
 * which has no business calling a live API at all. `cachedPromise` still
 * gives every caller the same "fetched once" behavior the old top-level
 * await had, just triggered by first use instead of by import.
 */
const cachedPromises: Partial<Record<string, Promise<FilterOptionsData>>> = {};

function cacheKey(lang: Lang, productType: 'nail' | 'nail_single'): string {
  return `${lang}:${productType}`;
}

export function loadFilterOptions(
  lang: Lang,
  productType: 'nail' | 'nail_single' = 'nail',
): Promise<FilterOptionsData> {
  const key = cacheKey(lang, productType);
  cachedPromises[key] ??= fetchFilterOptions(lang, { productType }).then((result) =>
    buildFilterOptionsData(result, lang),
  );
  return cachedPromises[key]!;
}

export function loadGiftFilterOptions(token: string, lang: Lang): Promise<FilterOptionsData> {
  return getReceiverGalleryFilters(token, lang).then((result) => buildFilterOptionsData(result, lang));
}

export function invalidateFilterOptionsCache(): void {
  for (const key of Object.keys(cachedPromises)) {
    delete cachedPromises[key];
  }
}
