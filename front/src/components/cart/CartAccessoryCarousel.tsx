import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { prefersReducedMotion } from '../../utils/scroll';
import type { ProductById } from '../../api/gallery';
import { useHorizontalDragScroll } from '../../hooks/useHorizontalDragScroll';
import { CartAccessoryCard } from './CartAccessoryCard';
import styles from './CartAccessoryCarousel.module.css';

interface CartAccessoryCarouselProps {
  products: ProductById[];
}

export function CartAccessoryCarousel({ products }: CartAccessoryCarouselProps) {
  const { t } = useLang();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const dragHandlers = useHorizontalDragScroll<HTMLDivElement>();

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
  }, [products]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  if (products.length === 0) return null;

  return (
    <div className={styles.scroller}>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowPrev}`}
        onClick={() => scrollByPage(-1)}
        disabled={!canPrev}
        aria-label={t.newArrivals.prev}
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
        aria-label={t.cart.addAccessoriesHeading}
        {...dragHandlers}
      >
        {products.map((product) => (
          <div key={product.id} className={styles.cardSlot}>
            <CartAccessoryCard product={product} />
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowNext}`}
        onClick={() => scrollByPage(1)}
        disabled={!canNext}
        aria-label={t.newArrivals.next}
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
  );
}
