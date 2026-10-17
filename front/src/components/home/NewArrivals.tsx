import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { SectionHeading } from '../ui/SectionHeading';
import { Button } from '../ui/Button';
import { fetchFeaturedItems } from '../../api/gallery';
import { getReceiverGalleryFeed } from '../../api/gift';
import { shopConfig } from '../../config/env';
import { prefersReducedMotion } from '../../utils/scroll';
import { NewArrivalCard } from './NewArrivalCard';
import type { GalleryItem } from '../../data/types';
import { preferredLanguage } from '../../assets/i18n/languagePreference';
import { localizedPath } from '../../config/i18nRoutes';
import { useHorizontalDragScroll } from '../../hooks/useHorizontalDragScroll';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import styles from './NewArrivals.module.css';

export function NewArrivals() {
  const { t, lang } = useLang();
  const apiLanguage = preferredLanguage();
  const gift = useOptionalGiftReceiver();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [featuredItems, setFeaturedItems] = useState<GalleryItem[]>([]);
  const dragHandlers = useHorizontalDragScroll<HTMLDivElement>();

  useEffect(() => {
    if (gift.active && gift.token) {
      void getReceiverGalleryFeed(gift.token, apiLanguage, {
        limit: shopConfig.featureNailsLimit,
        stock: 'in',
      }).then((result) => {
        const featured = result.items.filter((item) => item.isFeatured);
        setFeaturedItems(featured.length > 0 ? featured : result.items);
      });
      return;
    }
    void fetchFeaturedItems(shopConfig.featureNailsLimit, apiLanguage).then(setFeaturedItems);
  }, [apiLanguage, gift.active, gift.token, gift.summary?.remaining.remainingBudget]);

  const updateScrollState = () => {
    const el = trackRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setHasOverflow(overflow);
    setCanPrev(overflow && el.scrollLeft > 4);
    setCanNext(overflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
    // featuredItems: the track only exists once items have loaded (this
    // component returns null before that — see below), so the very first
    // run of this effect always finds trackRef.current still null and bails
    // out without attaching anything. Re-running once items arrive is what
    // actually measures the real track and wires up the listeners.
  }, [featuredItems]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  if (featuredItems.length === 0) return null;

  return (
    <section aria-labelledby="new-h" className={styles.section} data-testid="home-featured">
      <SectionHeading
        eyebrow={t.newArrivals.eyebrow}
        title={t.newArrivals.title}
        sub={t.newArrivals.sub}
        headingId="new-h"
        className={styles.heading}
      />
      <div className={styles.scroller}>
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowPrev}`}
          onClick={() => scrollByPage(-1)}
          disabled={!canPrev}
          aria-label={t.newArrivals.prev}
          data-testid="home-featured-prev"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M9 2L4 7L9 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div
          className={[styles.track, !hasOverflow && styles.trackCentered].filter(Boolean).join(' ')}
          ref={trackRef}
          role="group"
          aria-label={t.newArrivals.title}
          data-testid="home-featured-track"
          {...dragHandlers}
        >
          {featuredItems.map((item) => (
            <div key={item.id} className={styles.cardSlot} data-testid="home-featured-card">
              <NewArrivalCard item={item} altPrefix={t.gallery.altPrefix} />
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowNext}`}
          onClick={() => scrollByPage(1)}
          disabled={!canNext}
          aria-label={t.newArrivals.next}
          data-testid="home-featured-next"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M5 2L10 7L5 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className={styles.ctaRow}>
        <Button variant="ghost" to={localizedPath('/gallery', lang)} data-testid="home-featured-cta">
          {t.newArrivals.cta}
        </Button>
      </div>
    </section>
  );
}
