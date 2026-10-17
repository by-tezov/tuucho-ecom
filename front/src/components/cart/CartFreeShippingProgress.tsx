import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Strings } from '../../assets/i18n/types';
import { useFitOneLineTitle } from '../../hooks/useFitOneLineTitle';
import { formatPrice } from '../../utils/formatPrice';
import type { FreeShippingPreview } from '../../utils/cartRulesPreview';
import styles from './CartFeature.module.css';

const TITLE_FIT_MQ = '(max-width: 1023px)';

interface CartFreeShippingProgressProps {
  preview: FreeShippingPreview;
  t: Strings;
}

/** Franco progress in the cart courier block — same bar chrome as volume discount. */
export function CartFreeShippingProgress({ preview, t }: CartFreeShippingProgressProps) {
  const threshold = preview.threshold ?? 0;
  const progress = threshold > 0 ? Math.min(1, preview.current / threshold) : preview.applied ? 1 : 0;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useFitOneLineTitle(titleRef, t.cart.rulesFrancoTitle, TITLE_FIT_MQ);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setRevealed(true);
        io.disconnect();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ladder = t.cart.rulesFrancoLadder
    .replace('{current}', formatPrice(preview.current))
    .replace('{threshold}', formatPrice(threshold));
  const status = preview.applied
    ? t.cart.rulesFrancoMax
    : t.cart.rulesFrancoNext.replace('{need}', formatPrice(preview.need));

  const fillStyle = {
    width: revealed ? `${Math.round(progress * 100)}%` : '0%',
    '--rules-progress': String(Math.max(progress, 0.001)),
  } as CSSProperties;

  return (
    <div className={styles.francoProgress} role="status" data-testid="cart-franco-progress">
      <div className={styles.rulesProgressBody}>
        <div className={styles.rulesProgressHeader}>
          <div className={styles.rulesProgressTitleWrap}>
            <p ref={titleRef} className={styles.lineTitle}>
              {t.cart.rulesFrancoTitle}
            </p>
          </div>
          {preview.applied ? <span className={styles.variantPriceFree}>{t.cart.rulesFreePrice}</span> : null}
        </div>
        <p className={styles.rulesProgressLadder}>{ladder}</p>
        <div ref={trackRef} className={styles.rulesProgressTrack} aria-hidden="true">
          <div className={styles.rulesProgressFill} style={fillStyle} />
        </div>
        <p className={styles.rulesProgressStatus}>{status}</p>
      </div>
    </div>
  );
}
