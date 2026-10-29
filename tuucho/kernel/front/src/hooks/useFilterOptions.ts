import { useEffect, useState } from 'react';
import { loadFilterOptions, loadGiftFilterOptions } from '../api/filterOptions';
import type { FilterOptionsData } from '../api/filterOptions';
import { activeLanguage } from '../assets/i18n/languagePreference';
import { useOptionalGiftReceiver } from './useGiftReceiver';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';

export type GalleryFilterCatalog = 'sets' | 'units';

/**
 * Client-only fetch (see loadFilterOptions's own comment on why this used
 * to be a module-level top-level await instead, and why that was wrong) —
 * `undefined` until the first fetch resolves, same "nothing to show yet"
 * window every other on-demand fetch in this app already has (see
 * useGalleryFeed's loadingInitial). Never runs during SSR/prerender: this
 * only fires from a real mounted component in a real browser.
 *
 * `catalog: 'units'` scopes options to single-piece rows (`nail_single`) so
 * a unit filter sheet never lists set-only occasions/shapes.
 */
export function useFilterOptions(options?: {
  catalog?: GalleryFilterCatalog;
}): FilterOptionsData | undefined {
  const catalog = options?.catalog ?? 'sets';
  const apiLanguage = activeLanguage();
  const gift = useOptionalGiftReceiver();
  const [data, setData] = useState<FilterOptionsData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    const productType = catalog === 'units' ? 'nail_single' : 'nail';
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

/** Sold-out size request: the product-requests plugin. Missing/older backends
 * and the loading window keep the click active while the plugin is on. */
export function useOutOfStockSizeFlags(): {
  allowSizeRequest: boolean;
} {
  const data = useFilterOptions();
  const requestsOn = usePluginEnabled('tuucho-commerce-product-requests');
  return {
    allowSizeRequest: requestsOn && data?.outOfStockSizeRequestEnabled !== false,
  };
}
