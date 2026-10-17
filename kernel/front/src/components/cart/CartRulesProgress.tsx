import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Strings } from '../../assets/i18n/types';
import { useFitOneLineTitle } from '../../hooks/useFitOneLineTitle';
import type { NailQtyTierPreview } from '../../utils/cartRulesPreview';
import styles from './CartFeature.module.css';

const TITLE_FIT_MQ = '(max-width: 1023px)';

interface CartRulesProgressProps {
  tier: NailQtyTierPreview;
  t: Strings;
  /** Defaults to cart-page offer line chrome. Drawer passes its own classes. */
  className?: string;
  /** Mobile one-line title scale (default on — drawer + cart page). */
  fitTitle?: boolean;
  /** The drawer is narrower than the cart page, so it may use a smaller
   * minimum before falling back to an ellipsis. */
  minTitlePx?: number;
}

/** Volume-discount row — own layout (not cart `.lineBody` grid). */
export function CartRulesProgress({
  tier,
  t,
  className,
  fitTitle = true,
  minTitlePx = 10,
}: CartRulesProgressProps) {
  const maxMin = Math.max(...tier.tiers.map((step) => step.minQty), 1);
  const progress = Math.min(1, tier.nailQty / maxMin);
  const ladder = tier.tiers.map((step) => `${step.minQty}+ → ${step.percent}%`).join(' · ');
  // The arrow shorthand is for the eye; a screen reader would say "arrow".
  const ladderSpoken = tier.tiers
    .map((step) =>
      t.cart.rulesTierStepSpoken
        .replace('{qty}', String(step.minQty))
        .replace('{percent}', String(step.percent)),
    )
    .join(', ');
  const trackRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useFitOneLineTitle(
    titleRef,
    fitTitle ? t.cart.rulesTierTitle : '',
    fitTitle ? TITLE_FIT_MQ : '(max-width: 0px)',
    minTitlePx,
  );

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

  let status: string;
  if (tier.matched && !tier.next) {
    status = t.cart.rulesTierMax
      .replace('{percent}', String(tier.matched.percent))
      .replace('{qty}', String(tier.nailQty));
  } else if (tier.matched && tier.next) {
    status = t.cart.rulesTierMatchedNext
      .replace('{percent}', String(tier.matched.percent))
      .replace('{need}', String(tier.next.needQty))
      .replace('{nextPercent}', String(tier.next.percent));
  } else if (tier.next) {
    status = t.cart.rulesTierNext
      .replace('{need}', String(tier.next.needQty))
      .replace('{percent}', String(tier.next.percent));
  } else {
    status = t.cart.rulesTierIdle;
  }

  const fillStyle = {
    width: revealed ? `${Math.round(progress * 100)}%` : '0%',
    '--rules-progress': String(Math.max(progress, 0.001)),
  } as CSSProperties;

  const statusLines = status.split('\n').filter(Boolean);

  return (
    <li className={className ?? `${styles.line} ${styles.lineOffer}`} role="status">
      <div className={styles.rulesProgressBody}>
        <div className={styles.rulesProgressHeader}>
          <div className={styles.rulesProgressTitleWrap}>
            <p
              ref={titleRef}
              className={styles.lineTitle}
              style={
                fitTitle ? undefined : { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }
              }
            >
              {t.cart.rulesTierTitle}
            </p>
          </div>
          {tier.matched ? <span className={styles.variantPriceFree}>−{tier.matched.percent}%</span> : null}
        </div>
        <p className={styles.rulesProgressLadder}>
          <span aria-hidden="true">{ladder}</span>
          <span className="visuallyHidden">{ladderSpoken}</span>
        </p>
        <div ref={trackRef} className={styles.rulesProgressTrack} aria-hidden="true">
          <div className={styles.rulesProgressFill} style={fillStyle} />
        </div>
        <p className={styles.rulesProgressStatus}>
          {statusLines.map((line, i) => (
            <span key={i} className={styles.rulesProgressStatusLine}>
              {line}
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}
