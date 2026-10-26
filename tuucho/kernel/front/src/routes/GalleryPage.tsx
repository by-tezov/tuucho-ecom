import { useEffect, useState } from 'react';
import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { GalleryFilters } from '../components/gallery/GalleryFilters';
import { GalleryGrid } from '../components/gallery/GalleryGrid';
import { PhotoLightbox } from '../components/gallery/PhotoLightbox';
import { EmptyState } from '../components/gallery/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useGalleryFeed } from '../hooks/useGalleryFeed';
import { useGalleryFavorites } from '../hooks/useGalleryFavorites';
import { useGridColumnCount } from '../hooks/useGridColumnCount';
import { useStaggeredReveal } from '../hooks/useStaggeredReveal';
import { useGalleryLightboxRestore, useRestoredLightboxItem } from '../hooks/useGalleryLightboxRestore';
import { useOptionalGiftReceiver } from '../hooks/useGiftReceiver';
import { setGalleryLightboxRestorePending } from '../state/galleryLightboxRestorePending';
import { useGalleryProductDeepLink } from '../hooks/useGalleryProductDeepLink';
import { defaultLengthKey, defaultShapeKey } from '../data/galleryShape';
import type { GalleryItem } from '../data/types';
import { shopConfig } from '../config/env';
import { localizedPath } from '../config/i18nRoutes';
import cardStyles from '../components/gallery/GalleryCard.module.css';
import gridStyles from '../components/gallery/GalleryGrid.module.css';
import styles from './GalleryPage.module.css';

/** Rows of skeleton cards shown while the very first page is loading —
 * multiplied by the real (responsive) column count, see
 * useGridColumnCount, same reasoning as GalleryGrid's own loading rows. */
const INITIAL_SKELETON_ROWS = 2;

function RestoredGalleryLightbox({
  item,
  photoIndex,
  scrollY,
  onClose,
}: {
  item: GalleryItem;
  photoIndex: number;
  scrollY?: number;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [activeShape, setActiveShape] = useState(() => defaultShapeKey(item));
  const photos = item.photosByShapeLength[activeShape]?.[defaultLengthKey(item, activeShape)] ?? [];
  const [index, setIndex] = useState(() => Math.max(0, Math.min(photoIndex, Math.max(photos.length - 1, 0))));

  function selectShape(key: string) {
    if (key === activeShape) return;
    const nextPhotos = item.photosByShapeLength[key]?.[defaultLengthKey(item, key)] ?? [];
    setActiveShape(key);
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  }

  return (
    <PhotoLightbox
      item={item}
      activeShape={activeShape}
      activeLength={defaultLengthKey(item, activeShape)}
      onSelectShape={selectShape}
      index={index}
      onIndexChange={setIndex}
      alt={`${t.gallery.altPrefix}${item.title}`}
      onClose={onClose}
      openedAtScrollY={scrollY}
    />
  );
}

export function GalleryPage() {
  const { t, lang } = useLang();
  const gift = useOptionalGiftReceiver();
  const { favoriteIds } = useGalleryFavorites();
  const { restore: restoreLightbox, clear: clearRestoreLightbox } = useGalleryLightboxRestore();
  setGalleryLightboxRestorePending(restoreLightbox != null);
  const {
    filters,
    sizes,
    favoritesOnly,
    toggleFavoritesOnly,
    userLibraryOnly,
    toggleUserLibraryOnly,
    hasUserLibraryItems,
    stockFilter,
    priceRange,
    applyFilters,
    items,
    totalCount,
    hasMore,
    loadingInitial,
    loadingMore,
    loadMore,
    reset,
    restoredFromSession,
    unfiltered,
  } = useGalleryFeed(favoriteIds);
  const restoreItem = useRestoredLightboxItem(restoreLightbox, items);
  const skipReveal = restoredFromSession || restoreLightbox != null;
  // Next card starts its own enter animation this many ms before the
  // previous one finishes, so they overlap instead of running back-to-back
  // — see shopConfig.galleryCardRevealMs's doc comment.
  const cardStaggerMs = skipReveal
    ? 0
    : Math.max(0, shopConfig.galleryCardRevealMs - shopConfig.galleryCardOverlapRevealMs);
  const revealedItems = useStaggeredReveal(items, cardStaggerMs);
  const { ref: initialGridRef, columnCount: initialColumnCount } = useGridColumnCount<HTMLUListElement>();
  const animateEnter = !skipReveal && shopConfig.galleryCardRevealMs > 0;
  const deepLink = useGalleryProductDeepLink(lang);
  const giftBudgetExhausted =
    gift.active &&
    gift.canMutate &&
    !loadingInitial &&
    totalCount === 0 &&
    unfiltered &&
    (gift.summary?.remaining.quantity ?? 0) > 0;
  // Gift copy lives in tuucho-commerce-gift-locale-*; skip when the gift
  // surface is off so a disabled gift pack does not blank GalleryPage.
  const budgetExhaustedMessage = !giftBudgetExhausted
    ? ''
    : gift.summary?.giverDisplayName
      ? t.gift.budgetExhaustedFrom.replace('{name}', gift.summary.giverDisplayName)
      : t.gift.budgetExhausted;

  useEffect(() => {
    setGalleryLightboxRestorePending(restoreLightbox != null);
    return () => setGalleryLightboxRestorePending(false);
  }, [restoreLightbox]);

  useEffect(() => {
    if (!restoreLightbox || loadingInitial || loadingMore) return;
    if (items.some((item) => item.productUid === restoreLightbox.productUid)) return;
    if (!hasMore) return;
    loadMore();
  }, [hasMore, items, loadingInitial, loadingMore, loadMore, restoreLightbox]);

  return (
    <section aria-labelledby="gal-h" className={styles.section} data-testid="gallery-page">
      <Seo title={t.seo.galleryTitle} description={t.seo.galleryDesc} path="/gallery" />

      <div className={styles.heading}>
        <p className={styles.eyebrow}>{t.gallery.pageEyebrow}</p>
        <div className={styles.titleRow}>
          <h1 id="gal-h" className={styles.title}>
            {t.gallery.title}
          </h1>
        </div>
        <p className={styles.sub}>{t.gallery.sub}</p>
      </div>

      {giftBudgetExhausted ? null : (
        <GalleryFilters
          filters={filters}
          sizes={sizes}
          stockFilter={stockFilter}
          priceRange={priceRange}
          applyFilters={applyFilters}
          favoritesOnly={favoritesOnly}
          toggleFavoritesOnly={toggleFavoritesOnly}
          userLibraryOnly={userLibraryOnly}
          toggleUserLibraryOnly={toggleUserLibraryOnly}
          hasUserLibraryItems={hasUserLibraryItems}
          reset={reset}
          resultCount={totalCount}
        />
      )}

      {loadingInitial ? (
        <ul className={gridStyles.grid} aria-hidden="true" ref={initialGridRef}>
          {Array.from({ length: initialColumnCount * INITIAL_SKELETON_ROWS }).map((_, i) => (
            <li key={i}>
              <div className={cardStyles.card}>
                <Skeleton aspectRatio="1 / 1" className={cardStyles.photoPlaceholder} />
              </div>
            </li>
          ))}
        </ul>
      ) : totalCount > 0 ? (
        <GalleryGrid
          items={revealedItems}
          hasMore={hasMore}
          // Only the real next-page fetch gates paging: the staggered card
          // reveal drip (revealedItems catching up to items) must not hold
          // loadingMore, or a slow drip would block the scroll trigger.
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          animateEnter={animateEnter}
          cardRevealMs={shopConfig.galleryCardRevealMs}
          scrollToProductUid={restoreLightbox?.productUid ?? null}
          scrollToY={restoreLightbox?.scrollY ?? null}
          filterShapeKeys={filters.shape}
          filterLengthKeys={filters.length}
          filterSizeKeys={sizes}
        />
      ) : giftBudgetExhausted ? (
        <EmptyState
          message={budgetExhaustedMessage}
          action={{ to: localizedPath('/cart', lang), label: t.gift.budgetExhaustedCta }}
        />
      ) : (
        <EmptyState onReset={reset} message={favoritesOnly ? t.gallery.emptyFavorites : undefined} />
      )}

      {restoreItem && restoreLightbox ? (
        <RestoredGalleryLightbox
          key={restoreItem.productUid}
          item={restoreItem}
          photoIndex={restoreLightbox.photoIndex}
          {...(restoreLightbox.scrollY != null ? { scrollY: restoreLightbox.scrollY } : {})}
          onClose={clearRestoreLightbox}
        />
      ) : deepLink.item ? (
        <PhotoLightbox
          item={deepLink.item}
          activeShape={deepLink.activeShape}
          activeLength={deepLink.activeLength}
          onSelectShape={deepLink.selectShape}
          index={deepLink.index}
          onIndexChange={deepLink.setIndex}
          alt={`${t.gallery.altPrefix}${deepLink.item.title}`}
          onClose={deepLink.close}
        />
      ) : null}
    </section>
  );
}
