import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { GalleryItem } from '../../data/types';
import type { Size } from '../../api/cart';
import { GalleryCard } from './GalleryCard';
import { Skeleton } from '../ui/Skeleton';
import { useGridColumnCount } from '../../hooks/useGridColumnCount';
import { useCartCommands, useCartData, useCartOverlay } from '../../hooks/useCart';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import { useOutOfStockSizeFlags } from '../../hooks/useFilterOptions';
import { useGalleryFavorites } from '../../hooks/useGalleryFavorites';
import { shopConfig } from '../../config/env';
import { galleryRowIndexForProduct } from './galleryRowIndex';
import { nextGalleryLoadMoreLatch } from './galleryLoadMoreLatch';
import { scrollWindowInstant } from '../../utils/scroll';
import cardStyles from './GalleryCard.module.css';
import styles from './GalleryGrid.module.css';

interface GalleryGridProps {
  items: GalleryItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Play the card slide-in when each item mounts (staggered reveal). */
  animateEnter?: boolean;
  /** Duration (ms) of that slide-in — set once here as a CSS custom
   * property so every card (however deep in the virtualized rows) can
   * reference it without threading an inline style through each one. */
  cardRevealMs?: number;
  /** Jump this product's row into view before paint (size-guide Back). */
  scrollToProductUid?: string | null;
  /** Fallback window offset captured when the zoom opened. Used until the
   * product is in the loaded grid (and after overlay pushState races). */
  scrollToY?: number | null;
  /** Active gallery shape/length/size filter, relayed to every card (see
   * GalleryCard's own doc comment on filterShapeKeys/filterLengthKeys/
   * filterSizeKeys). */
  filterShapeKeys: string[];
  filterLengthKeys: string[];
  filterSizeKeys: string[];
}

// A couple of rows above/below the viewport is enough for scroll smoothness;
// large overscan was mounting dozens of cards (and image requests) early —
// see shopConfig.galleryRowOverscan (VITE_GALLERY_ROW_OVERSCAN).
const OVERSCAN = shopConfig.galleryRowOverscan;
/** Rough initial guess only — each row's real height is measured and
 * corrected via the virtualizer's own ResizeObserver (see `measureElement`
 * below), since actual card height varies with column width (square photo)
 * and caption text length. */
// A desktop row is about 500px once its square photo, caption and purchase
// controls are present. The former 360px estimate was far too short, so the
// virtualizer repeatedly corrected several hundred pixels as images loaded;
// that can move a card out from under a person's pointer. Measurements still
// refine this for every breakpoint, but now start close to the real geometry.
const ESTIMATED_ROW_HEIGHT = 500;
/** Same values as .grid's `gap` in GalleryGrid.module.css — used as an
 * inline padding-bottom (not a CSS margin) so each row's *measured* height
 * already includes the space before the next one; a margin isn't included
 * in the virtualizer's own element measurement. */
const ROW_GAP_MOBILE_PX = 11;
const ROW_GAP_DESKTOP_PX = 22;
const ROW_GAP_MQ = '(min-width: 1024px)';

function useRowGapPx(): number {
  const [gap, setGap] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(ROW_GAP_MQ).matches
      ? ROW_GAP_DESKTOP_PX
      : ROW_GAP_MOBILE_PX,
  );
  useEffect(() => {
    const mq = window.matchMedia(ROW_GAP_MQ);
    const sync = () => setGap(mq.matches ? ROW_GAP_DESKTOP_PX : ROW_GAP_MOBILE_PX);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return gap;
}

type Cell = { kind: 'item'; item: GalleryItem } | { kind: 'skeleton' };

/** Virtualizes the gallery by *row*, not by individual card, since the
 * underlying layout is still a responsive `repeat(auto-fill, ...)` CSS
 * grid whose column count only resolves in the browser (see
 * useGridColumnCount). Only rows in/near the viewport are ever mounted —
 * the DOM node count this renders stays roughly constant regardless of how
 * many feed pages have loaded, unlike the previous "every loaded item gets
 * a permanent <li>" version (only each card's own <img> was ever
 * unmounted, via GalleryCard's useInViewport — see its doc comment). Uses
 * useWindowVirtualizer (not the div-scroller useVirtualizer) because this
 * page scrolls with the document, not an inner scroll box.
 */
export function GalleryGrid({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  animateEnter = false,
  cardRevealMs = 0,
  scrollToProductUid = null,
  scrollToY = null,
  filterShapeKeys,
  filterLengthKeys,
  filterSizeKeys,
}: GalleryGridProps) {
  // Subscribe once for the whole grid so memoized GalleryCard is not defeated
  // by per-card useCartData / useCartCommands / gift context.
  const { cartReady, getCartLine } = useCartData();
  const { addToCart } = useCartCommands();
  const { registerModalClose } = useCartOverlay();
  const { getFavoriteVariant, setFavoriteVariant } = useGalleryFavorites();
  const gift = useOptionalGiftReceiver();
  const { allowSizeRequest } = useOutOfStockSizeFlags();

  // .grid's own repeat(auto-fill, ...) columns aren't a fixed number — how
  // many actually fit depends on viewport width. Read back from a
  // permanently-mounted, invisible probe (not one of the virtualized rows
  // themselves, which mount/unmount as you scroll) so column-count tracking
  // survives regardless of scroll position.
  const { ref: gridRef, columnCount, measured: columnsMeasured } = useGridColumnCount<HTMLUListElement>();
  const rowGapPx = useRowGapPx();

  // First finish out the current partial row (if items.length isn't a
  // multiple of columnCount), then one full extra row of skeletons below
  // it — so the loading state always reads as "this row is still filling
  // in, and here's a full next row coming", never a row that just stops
  // short with an unrelated full row floating below it.
  const remainder = columnCount > 0 ? items.length % columnCount : 0;
  const skeletonCount = loadingMore ? (remainder === 0 ? 0 : columnCount - remainder) + columnCount : 0;

  // Memoized because useWindowVirtualizer re-renders this component on every
  // scroll frame, and this array is sized by how many items are *loaded*, not
  // how many are rendered. Several pages in, the unmemoized version allocated
  // a few hundred wrapper objects per frame during the one interaction that
  // has to stay smooth.
  const cells: Cell[] = useMemo(
    () => [
      ...items.map((item): Cell => ({ kind: 'item', item })),
      ...Array.from({ length: skeletonCount }, (): Cell => ({ kind: 'skeleton' })),
    ],
    [items, skeletonCount],
  );
  const safeColumnCount = Math.max(columnCount, 1);
  const rowCount = Math.ceil(cells.length / safeColumnCount);

  const parentRef = useRef<HTMLDivElement | null>(null);
  // State, not a ref — a ref wouldn't trigger the re-render needed to hand
  // the real (non-zero) offset to useWindowVirtualizer below; it's only
  // known after the first layout pass.
  const [parentOffset, setParentOffset] = useState(0);
  const [parentMeasured, setParentMeasured] = useState(false);
  useLayoutEffect(() => {
    setParentOffset(parentRef.current?.offsetTop ?? 0);
    setParentMeasured(true);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: parentOffset,
    ...(typeof scrollToY === 'number' && scrollToY > 0 ? { initialOffset: scrollToY } : {}),
  });
  // This is an instance-level virtualizer hook (rather than an options
  // field in the installed React wrapper). Do not adjust window scroll while
  // a row's real height arrives: it could move a card out from under the
  // customer's pointer as its photo/caption is measured.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;
  const virtualRows = virtualizer.getVirtualItems();
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const lastVirtualRowIndex = lastVirtualRow?.index;
  const loadMoreLatchedRef = useRef(false);

  const restoreReady = Boolean(scrollToProductUid) && columnsMeasured && parentMeasured;

  const alignRestoredProduct = useCallback(() => {
    if (!scrollToProductUid) return;
    const rowIndex = galleryRowIndexForProduct(items, scrollToProductUid, safeColumnCount);
    if (rowIndex != null) {
      virtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'auto' });
      return;
    }
    if (typeof scrollToY === 'number' && scrollToY > 0) {
      scrollWindowInstant(scrollToY);
    }
  }, [items, safeColumnCount, scrollToProductUid, scrollToY, virtualizer]);

  useLayoutEffect(() => {
    if (!restoreReady) return;
    alignRestoredProduct();
  }, [alignRestoredProduct, parentOffset, restoreReady]);

  // Layout's ScrollToTop (parent) and PhotoLightbox's overlay pushState run
  // after this grid's layout and can reset the window to 0. Re-apply after
  // those turns so the product stays under the already-open zoom modal.
  useEffect(() => {
    if (!restoreReady) return;
    alignRestoredProduct();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      alignRestoredProduct();
      raf2 = requestAnimationFrame(() => alignRestoredProduct());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [alignRestoredProduct, restoreReady]);

  // Same trigger point the old IntersectionObserver sentinel gave (near
  // the end of the rendered list), just driven by the virtualizer's own
  // rendered range instead of a separate observed DOM element. The latch
  // rules live in galleryLoadMoreLatch; the one to remember here is that a
  // finished fetch (loadingMore falling) re-arms the trigger, so sitting at
  // the end of the grid no longer strands paging on page 3+.
  useEffect(() => {
    const next = nextGalleryLoadMoreLatch({
      latched: loadMoreLatchedRef.current,
      atEnd: lastVirtualRowIndex !== undefined && lastVirtualRowIndex >= rowCount - 1,
      hasMore,
      loadingMore,
    });
    loadMoreLatchedRef.current = next.latched;
    if (next.fire) onLoadMore();
  }, [lastVirtualRowIndex, rowCount, hasMore, loadingMore, onLoadMore]);

  return (
    <div
      ref={parentRef}
      className={styles.viewport}
      style={{ '--card-reveal-ms': `${cardRevealMs}ms` } as CSSProperties}
    >
      {/* Invisible, always-mounted probe — exists purely so
          useGridColumnCount has a stable element to observe (see its own
          ref comment above). */}
      <ul className={`${styles.grid} ${styles.measureProbe}`} ref={gridRef} aria-hidden="true" />

      {/* One list for the whole gallery, not one <ul> per virtual row (which
          announced "list of 4 items" every row). Rows are plain wrappers the
          accessibility tree skips; each card is a listitem whose position and
          total survive virtualization (aria-posinset / aria-setsize, -1 while
          more pages remain). */}
      <div role="list" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const rowStart = virtualRow.index * safeColumnCount;
          const rowCells = cells.slice(rowStart, rowStart + safeColumnCount);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={styles.row}
              style={{
                transform: `translateY(${virtualRow.start - parentOffset}px)`,
                paddingBottom: virtualRow.index === rowCount - 1 ? 0 : rowGapPx,
              }}
            >
              <div className={styles.grid}>
                {rowCells.map((cell, i) => {
                  if (cell.kind !== 'item') {
                    return (
                      <div key={`skeleton-${virtualRow.index}-${i}`} aria-hidden="true">
                        <div className={cardStyles.card}>
                          <Skeleton aspectRatio="1 / 1" className={cardStyles.photoPlaceholder} />
                        </div>
                      </div>
                    );
                  }
                  const cartLine = getCartLine(cell.item.id);
                  const cartLineSize: Size | undefined =
                    cartLine?.size === '' || cartLine?.size == null ? undefined : (cartLine.size as Size);
                  const favorite = getFavoriteVariant(cell.item.id);
                  return (
                    <GalleryCard
                      key={cell.item.id}
                      item={cell.item}
                      position={rowStart + i + 1}
                      setSize={hasMore ? -1 : items.length}
                      animateEnter={animateEnter}
                      cartReady={cartReady}
                      {...(cartLineSize ? { cartLineSize } : {})}
                      addToCart={addToCart}
                      registerModalClose={registerModalClose}
                      favorite={favorite}
                      setFavoriteVariant={setFavoriteVariant}
                      giftActive={gift.active}
                      giftCanMutate={gift.canMutate}
                      allowSizeRequest={allowSizeRequest}
                      filterShapeKeys={filterShapeKeys}
                      filterLengthKeys={filterLengthKeys}
                      filterSizeKeys={filterSizeKeys}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
