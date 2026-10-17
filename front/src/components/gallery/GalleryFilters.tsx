import { useState } from 'react';
import { useLang } from '../../assets/i18n';
import { useFilterOptions } from '../../hooks/useFilterOptions';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import type {
  GalleryFilterDraft,
  GalleryFilters as GalleryFiltersState,
  GalleryPriceRange,
  StockFilter,
} from '../../hooks/useGalleryFeed';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { LazyGalleryFilterSheet } from './LazyGalleryFilterSheet';
import styles from './GalleryFilters.module.css';

interface GalleryFiltersProps {
  filters: GalleryFiltersState;
  sizes: string[];
  stockFilter: StockFilter;
  priceRange: GalleryPriceRange | null;
  applyFilters: (draft: GalleryFilterDraft, priceCatalogue: GalleryPriceRange | null) => void;
  favoritesOnly: boolean;
  toggleFavoritesOnly: () => void;
  userLibraryOnly: boolean;
  toggleUserLibraryOnly: () => void;
  hasUserLibraryItems: boolean;
  reset: () => void;
  resultCount: number;
  /** Nail catalogue: no quantity stock / size chips (offer is a boolean and
   * the set size lives on the composition). */
  showStockAndSizeFilters?: boolean;
  /** False hides the price range (the compose-a-set gallery prices the set,
   * not the single nail) and never applies one. */
  showPriceFilter?: boolean;
  /** Scopes filter option lists (occasion/shape/…) to sets or single nails. */
  catalog?: 'sets' | 'nails';
}

export function GalleryFilters({
  filters,
  sizes,
  stockFilter,
  priceRange,
  applyFilters,
  favoritesOnly,
  toggleFavoritesOnly,
  userLibraryOnly,
  toggleUserLibraryOnly,
  hasUserLibraryItems,
  reset,
  resultCount,
  showStockAndSizeFilters = true,
  showPriceFilter = true,
  catalog = 'sets',
}: GalleryFiltersProps) {
  const { t } = useLang();
  const gift = useOptionalGiftReceiver();
  const resultLabel = `${resultCount} ${resultCount > 1 ? t.gallery.many : t.gallery.one}`;
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // undefined until the client-side fetch resolves (see useFilterOptions) —
  // never populated during SSR/prerender, so the bar simply doesn't render
  // yet rather than the build needing pamsurin-back to be reachable.
  const filterData = useFilterOptions({ catalog });
  if (!filterData) return null;
  const { filterOptions, outOfStockEnabled } = filterData;
  const priceCatalogue = showPriceFilter ? filterData.priceCatalogue : null;
  const stockFilterVisible = showStockAndSizeFilters && outOfStockEnabled;
  const sizeFilterVisible = showStockAndSizeFilters;
  const filtersActive =
    filters.occasion.length > 0 ||
    filters.shape.length > 0 ||
    filters.length.length > 0 ||
    (sizeFilterVisible && sizes.length > 0) ||
    (stockFilterVisible && stockFilter !== 'in') ||
    (showPriceFilter && priceRange !== null);

  return (
    <>
      <div className={styles.summaryRow}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={filterSheetOpen}
          data-testid="gallery-filters-toggle"
          className={
            filtersActive
              ? `${styles.filtersButton} ${styles.filtersButtonActive} ${styles.filterGoldBorder}`
              : `${styles.filtersButton} ${styles.filterGoldBorder}`
          }
          onMouseDown={suppressMouseFocus}
          onClick={() => setFilterSheetOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1.5 2.5H12.5L8.25 7.4V11.5L5.75 10.2V7.4L1.5 2.5Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          {t.gallery.filtersToggle}
        </button>
        {!gift.active && (
          <button
            type="button"
            aria-pressed={favoritesOnly}
            data-testid="gallery-favorites-only"
            className={
              favoritesOnly
                ? `${styles.favoritesButton} ${styles.favoritesButtonActive} ${styles.filterGoldBorder}`
                : `${styles.favoritesButton} ${styles.filterGoldBorder}`
            }
            onMouseDown={suppressMouseFocus}
            onClick={toggleFavoritesOnly}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 12.1 2.45 7.55C1.35 6.45 1.35 4.65 2.45 3.55 3.55 2.45 5.35 2.45 6.45 3.55L7 4.1l.55-.55c1.1-1.1 2.9-1.1 4 0 1.1 1.1 1.1 2.9 0 4L7 12.1Z"
                fill={favoritesOnly ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            {t.gallery.favoritesFilterLabel}
          </button>
        )}
        {!gift.active && hasUserLibraryItems && (
          <button
            type="button"
            aria-pressed={userLibraryOnly}
            data-testid="gallery-user-library-only"
            className={
              userLibraryOnly
                ? `${styles.favoritesButton} ${styles.favoritesButtonActive} ${styles.filterGoldBorder}`
                : `${styles.favoritesButton} ${styles.filterGoldBorder}`
            }
            onMouseDown={suppressMouseFocus}
            onClick={toggleUserLibraryOnly}
          >
            {t.gallery.userLibraryFilterLabel}
          </button>
        )}
      </div>

      <div className={styles.filterResetRow}>
        <p
          aria-live="polite"
          aria-atomic="true"
          className={styles.resultLabel}
          data-testid="gallery-result-count"
        >
          {resultLabel}
        </p>
        <button type="button" className={styles.filterResetBottom} onClick={reset}>
          {t.gallery.reset}
        </button>
      </div>
      <hr className={styles.filterSeparator} />

      {filterSheetOpen && (
        <LazyGalleryFilterSheet
          filters={filters}
          sizes={sizeFilterVisible ? sizes : []}
          stockFilter={stockFilterVisible ? stockFilter : 'in'}
          outOfStockEnabled={stockFilterVisible}
          showSizeFilter={sizeFilterVisible}
          priceRange={showPriceFilter ? priceRange : null}
          priceCatalogue={priceCatalogue}
          sizeOptions={filterOptions.size}
          shapeOptions={filterOptions.shape}
          lengthOptions={filterOptions.length}
          occasionOptions={filterOptions.occasion}
          onApply={(draft) => applyFilters(draft, priceCatalogue)}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}
    </>
  );
}
