import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../../assets/i18n';
import { filterGroupLabels } from '../../data/filters';
import type { FilterOption } from '../../api/filterOptions';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import type {
  GalleryFilterDraft,
  GalleryFilters,
  GalleryPriceRange,
  StockFilter,
} from '../../hooks/useGalleryFeed';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { PriceRangeSlider } from './PriceRangeSlider';
import styles from './GalleryFilterSheet.module.css';

function isPriceRangeFilterActive(value: GalleryPriceRange, bounds: GalleryPriceRange): boolean {
  return value.min > bounds.min || value.max < bounds.max;
}

/** Picks the option chip's own active/inactive look explicitly from the
 * same boolean passed to Chip's `active` prop — see the .filterChipActive/
 * .filterChipInactive rules in the stylesheet for why this isn't done via
 * a `:not(.chipActive)` CSS selector instead. */
function filterChipClass(active: boolean, extra?: string): string {
  return [styles.filterChip, active ? styles.filterChipActive : styles.filterChipInactive, extra]
    .filter(Boolean)
    .join(' ');
}

/** Title centered on a "cut line", same look as OrdersList's
 * .itemGroupLabel — plus a "Réinitialiser" link pinned to the row's right
 * edge, clearing just this one section (t.gallery.reset — same wording as
 * the whole-sheet reset link outside it, just scoped narrower). */
function SectionHeader({
  title,
  resetActive,
  onReset,
}: {
  title: string;
  resetActive: boolean;
  onReset: () => void;
}) {
  const { t } = useLang();
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionHeaderLine} aria-hidden="true" />
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionHeaderEnd}>
        <span className={styles.sectionHeaderLine} aria-hidden="true" />
        <button
          type="button"
          aria-pressed={resetActive}
          className={
            resetActive ? `${styles.sectionAllLink} ${styles.sectionAllLinkActive}` : styles.sectionAllLink
          }
          onClick={onReset}
        >
          {t.gallery.reset}
        </button>
      </div>
    </div>
  );
}

function defaultDraft(
  filters: GalleryFilters,
  sizes: string[],
  stockFilter: StockFilter,
  priceRange: GalleryPriceRange | null,
  priceCatalogue: GalleryPriceRange | null,
): GalleryFilterDraft {
  return {
    occasion: filters.occasion,
    shape: filters.shape,
    length: filters.length,
    sizes,
    stockFilter,
    price: priceRange ?? priceCatalogue ?? { min: 0, max: 0 },
  };
}

interface GalleryFilterSheetProps {
  filters: GalleryFilters;
  sizes: string[];
  stockFilter: StockFilter;
  outOfStockEnabled: boolean;
  /** False for nail_single compose gallery (no XS/S/M/L quantity filter). */
  showSizeFilter?: boolean;
  priceRange: GalleryPriceRange | null;
  priceCatalogue: GalleryPriceRange | null;
  sizeOptions: FilterOption[];
  shapeOptions: FilterOption[];
  lengthOptions: FilterOption[];
  occasionOptions: FilterOption[];
  onApply: (draft: GalleryFilterDraft) => void;
  onClose: () => void;
}

/** Renders as a bottom sheet on mobile and a centered dialog on wider
 * screens — same breakpoint-switch idea used elsewhere in this codebase's
 * modals, but a single consolidated panel for every gallery filter
 * dimension instead of one modal per pill. Selections only take effect on
 * "Valider" (onApply) — chip clicks below only ever touch the local draft. */
export function GalleryFilterSheet({
  filters,
  sizes,
  stockFilter,
  outOfStockEnabled,
  showSizeFilter = true,
  priceRange,
  priceCatalogue,
  sizeOptions,
  shapeOptions,
  lengthOptions,
  occasionOptions,
  onApply,
  onClose,
}: GalleryFilterSheetProps) {
  const { t, lang } = useLang();
  const [draft, setDraft] = useState<GalleryFilterDraft>(() =>
    defaultDraft(filters, sizes, stockFilter, priceRange, priceCatalogue),
  );
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  /** Every multi-select section (Taille/Forme/Occasion) OR-matches within
   * itself the same way — picking two shapes shows either, not both at
   * once — so one toggle covers all three draft arrays. */
  function toggleDraftValue(field: 'sizes' | 'shape' | 'length' | 'occasion', value: string) {
    setDraft((current) => {
      if (value === 'all') return { ...current, [field]: [] };
      const list = current[field];
      return {
        ...current,
        [field]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  }

  function validate() {
    onApply(draft);
    onClose();
  }

  const priceSectionVisible = priceCatalogue !== null && priceCatalogue.max > priceCatalogue.min;

  return createPortal(
    <ModalBackdrop className={styles.backdrop ?? ''} label={t.gallery.filtersToggle} onClose={requestClose}>
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{t.gallery.filtersToggle}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.gallery.close}
            data-modal-close
          >
            <CloseIcon />
          </button>
        </div>

        <ModalScrollBody {...(styles.scrollBody ? { className: styles.scrollBody } : {})}>
          {outOfStockEnabled && (
            <section className={styles.section}>
              <SectionHeader
                title={t.gallery.stockFilterSectionLabel}
                resetActive={draft.stockFilter === 'all'}
                onReset={() => setDraft((current) => ({ ...current, stockFilter: 'all' }))}
              />
              <div className={styles.chipRow} role="group" aria-label={t.gallery.stockFilterAria}>
                <Chip
                  active={draft.stockFilter === 'in'}
                  className={filterChipClass(draft.stockFilter === 'in')}
                  onClick={() => setDraft((current) => ({ ...current, stockFilter: 'in' }))}
                >
                  {t.gallery.stockFilterIn}
                </Chip>
                <Chip
                  active={draft.stockFilter === 'out'}
                  data-testid="gallery-stock-out"
                  className={filterChipClass(draft.stockFilter === 'out')}
                  onClick={() => setDraft((current) => ({ ...current, stockFilter: 'out' }))}
                >
                  {t.gallery.stockFilterOut}
                </Chip>
              </div>
            </section>
          )}

          {showSizeFilter && (
            <section className={styles.section}>
              <SectionHeader
                title={filterGroupLabels.size[lang]}
                resetActive={draft.sizes.length === 0}
                onReset={() => toggleDraftValue('sizes', 'all')}
              />
              <div className={styles.chipRow} role="group" aria-label={filterGroupLabels.size[lang]}>
                {sizeOptions.slice(1).map((option) => (
                  <Chip
                    key={option.value}
                    active={draft.sizes.includes(option.value)}
                    data-testid="gallery-size-filter-chip"
                    data-size={option.value}
                    className={filterChipClass(draft.sizes.includes(option.value), styles.chipLiteral)}
                    onClick={() => toggleDraftValue('sizes', option.value)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section className={styles.section}>
            <SectionHeader
              title={filterGroupLabels.shape[lang]}
              resetActive={draft.shape.length === 0}
              onReset={() => toggleDraftValue('shape', 'all')}
            />
            <div className={styles.chipRow} role="group" aria-label={filterGroupLabels.shape[lang]}>
              {shapeOptions.slice(1).map((option) => (
                <Chip
                  key={option.value}
                  active={draft.shape.includes(option.value)}
                  className={filterChipClass(draft.shape.includes(option.value))}
                  onClick={() => toggleDraftValue('shape', option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <SectionHeader
              title={filterGroupLabels.length[lang]}
              resetActive={draft.length.length === 0}
              onReset={() => toggleDraftValue('length', 'all')}
            />
            <div className={styles.chipRow} role="group" aria-label={filterGroupLabels.length[lang]}>
              {lengthOptions.slice(1).map((option) => (
                <Chip
                  key={option.value}
                  active={draft.length.includes(option.value)}
                  className={filterChipClass(draft.length.includes(option.value))}
                  onClick={() => toggleDraftValue('length', option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </section>

          {priceSectionVisible && priceCatalogue && (
            <section className={styles.section}>
              <SectionHeader
                title={t.gallery.priceRangeSectionLabel}
                resetActive={!isPriceRangeFilterActive(draft.price, priceCatalogue)}
                onReset={() => setDraft((current) => ({ ...current, price: priceCatalogue }))}
              />
              <PriceRangeSlider
                bounds={priceCatalogue}
                value={draft.price}
                onChange={(price) => setDraft((current) => ({ ...current, price }))}
              />
            </section>
          )}

          <section className={styles.section}>
            <SectionHeader
              title={filterGroupLabels.occasion[lang]}
              resetActive={draft.occasion.length === 0}
              onReset={() => toggleDraftValue('occasion', 'all')}
            />
            <div className={styles.chipRow} role="group" aria-label={filterGroupLabels.occasion[lang]}>
              {occasionOptions.slice(1).map((option) => (
                <Chip
                  key={option.value}
                  active={draft.occasion.includes(option.value)}
                  className={filterChipClass(draft.occasion.includes(option.value))}
                  onClick={() => toggleDraftValue('occasion', option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </section>
        </ModalScrollBody>

        <div className={styles.footer}>
          <Button
            variant="ghost"
            type="button"
            className={styles.footerButton}
            onClick={() =>
              setDraft({
                occasion: [],
                shape: [],
                length: [],
                sizes: [],
                stockFilter: 'in',
                price: priceCatalogue ?? { min: 0, max: 0 },
              })
            }
          >
            {t.gallery.clearFilters}
          </Button>
          <Button
            variant="primary"
            type="button"
            className={styles.footerButton}
            data-testid="gallery-filters-apply"
            onClick={validate}
          >
            {t.gallery.applyFilters}
          </Button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
