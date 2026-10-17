import { useEffect, useState } from 'react';
import { loadFilterOptions, loadGiftFilterOptions } from '../api/filterOptions';
import type { FilterOptionsData } from '../api/filterOptions';
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { useOptionalGiftReceiver } from './useGiftReceiver';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';

export type GalleryFilterCatalog = 'sets' | 'nails';

/**
 * Client-only fetch (see loadFilterOptions's own comment on why this used
 * to be a module-level top-level await instead, and why that was wrong) —
 * `undefined` until the first fetch resolves, same "nothing to show yet"
 * window every other on-demand fetch in this app already has (see
 * useGalleryFeed's loadingInitial). Never runs during SSR/prerender: this
 * only fires from a real mounted component in a real browser.
 *
 * `catalog: 'nails'` scopes options to `product_type = nail_single` so the
 * compose-a-set filter sheet never lists set-only occasions/shapes.
 */
export function useFilterOptions(options?: {
  catalog?: GalleryFilterCatalog;
}): FilterOptionsData | undefined {
  const catalog = options?.catalog ?? 'sets';
  const apiLanguage = preferredLanguage();
  const gift = useOptionalGiftReceiver();
  const [data, setData] = useState<FilterOptionsData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    const productType = catalog === 'nails' ? 'nail_single' : 'nail';
    const load =
      gift.active && gift.token && catalog === 'sets'
        ? loadGiftFilterOptions(gift.token, apiLanguage)
        : loadFilterOptions(apiLanguage, productType);
    void load.then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apiLanguage, catalog, gift.active, gift.token, gift.summary?.remaining.remainingBudget]);

  return data;
}

/** Boutique size-request flag. Missing/older backends and the loading window keep
 * the size-request click active. Sold-out size chips are always shown. */
export function useOutOfStockSizeFlags(): {
  allowSizeRequest: boolean;
} {
  const data = useFilterOptions();
  const requestsOn = usePluginEnabled('commerce-product-requests');
  return {
    allowSizeRequest: requestsOn && data?.outOfStockSizeRequestEnabled !== false,
  };
}
