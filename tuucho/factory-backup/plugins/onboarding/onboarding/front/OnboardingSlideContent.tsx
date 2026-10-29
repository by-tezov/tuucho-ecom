import { useEffect, useState, type CSSProperties } from 'react';
import { onboardingImages } from '@kernel/front/assets/images/onboarding/manifest';
import { resolveBrandAsset, useBrandAssets } from '@kernel/front/plugins/BrandAssetsContext';
import { LoyaltyScene } from './LoyaltyScene';
import type { OnboardingSlide } from './onboardingSlides';
import styles from './OnboardingOverlay.module.css';

interface OnboardingProgressBarProps {
  progress: number;
  /** Restart the fill animation when the slide becomes active. */
  active: boolean;
}

/** Same cold→hot track language as cart franco / volume bars. */
function OnboardingProgressBar({ progress, active }: OnboardingProgressBarProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!active) {
      setRevealed(false);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true);
      return;
    }
    const id = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(id);
  }, [active]);

  const clamped = Math.min(1, Math.max(0, progress));
  const fillStyle = {
    width: revealed ? `${Math.round(clamped * 100)}%` : '0%',
    '--rules-progress': String(Math.max(clamped, 0.001)),
  } as CSSProperties;

  return (
    <div className={styles.progressTrack} aria-hidden="true">
      <div className={styles.progressFill} style={fillStyle} />
    </div>
  );
}

/** Full-bleed photo with headline (light alpha) and solid body card overlays. */
function PhotoSlide({ src, headline, body }: { src: string; headline: string; body: string }) {
  return (
    <div className={styles.photoSlide}>
      <img className={styles.photoImage} src={src} alt="" draggable={false} />
      <div className={styles.photoHeadlineRow}>
        <h2 className={styles.photoHeadline}>{headline}</h2>
      </div>
      <div className={styles.photoBody}>
        <p className={styles.copy}>{body}</p>
      </div>
    </div>
  );
}

interface OnboardingSlideContentProps {
  slide: OnboardingSlide;
  active: boolean;
}

/** Per-slide body: photo heroes, deals cards, or loyalty banner + scene.
 * Photo artwork resolves through brand assets: a bootstrap `brandAssets`
 * override wins, the kernel demo image is the default. */
export function OnboardingSlideContent({ slide, active }: OnboardingSlideContentProps) {
  const brandAssets = useBrandAssets();
  const deals = slide.dealsCopy;

  if (slide.id === 'handmade' && slide.body) {
    return (
      <PhotoSlide
        src={resolveBrandAsset(brandAssets, 'onboardingHandmade', onboardingImages.handmade)}
        headline={slide.headline}
        body={slide.body}
      />
    );
  }

  if (slide.id === 'loyalty' && slide.body) {
    return (
      <div className={styles.loyaltySlide}>
        <div className={styles.loyaltyBanner}>
          <img
            className={styles.loyaltyBannerImage}
            src={resolveBrandAsset(brandAssets, 'onboardingLoyalty', onboardingImages.loyalty)}
            alt=""
            draggable={false}
          />
          <div className={styles.photoHeadlineRow}>
            <h2 className={styles.photoHeadline}>{slide.headline}</h2>
          </div>
        </div>
        <LoyaltyScene active={active} />
        <div className={styles.bodyBlock}>
          <p className={styles.copy}>{slide.body}</p>
        </div>
      </div>
    );
  }

  if (slide.id === 'custom' && slide.body) {
    return (
      <PhotoSlide
        src={resolveBrandAsset(brandAssets, 'onboardingCustom', onboardingImages.custom)}
        headline={slide.headline}
        body={slide.body}
      />
    );
  }

  if (slide.id === 'deals' && deals) {
    return (
      <div className={styles.dealsSlide}>
        <img
          className={styles.dealsBg}
          src={resolveBrandAsset(brandAssets, 'onboardingDeals', onboardingImages.deals)}
          alt=""
          draggable={false}
        />
        <div className={styles.dealsForeground}>
          <div className={styles.photoHeadlineRow}>
            <h2 className={styles.photoHeadline}>{slide.headline}</h2>
          </div>
          <div className={`${styles.bodyBlock} ${styles.dealsSubheadlineBlock}`}>
            <p className={styles.dealsSubheadline}>{deals.subheadline}</p>
          </div>
          <div className={styles.sections}>
            {slide.volume ? (
              <section className={styles.card}>
                <p className={styles.cardTitle}>{deals.volumeTitle}</p>
                <p className={styles.cardLead}>{deals.volumeLead}</p>
                {deals.volumeLadder ? <p className={styles.cardLadder}>{deals.volumeLadder}</p> : null}
                <OnboardingProgressBar progress={slide.volume.demoProgress} active={active} />
                <p className={styles.cardHint}>{deals.volumeHint}</p>
              </section>
            ) : null}

            {slide.freeShipping ? (
              <section className={styles.card}>
                <p className={styles.cardTitle}>{deals.freeShippingTitle}</p>
                <p className={styles.cardLead}>{deals.freeShippingLead}</p>
                <OnboardingProgressBar progress={slide.freeShipping.demoProgress} active={active} />
                {slide.freeShipping.thresholdLabel ? (
                  <p className={styles.cardHint}>{deals.freeShippingHint}</p>
                ) : null}
              </section>
            ) : null}

            {!slide.volume && !slide.freeShipping && slide.body ? (
              <p className={styles.copy}>{slide.body}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2 className={styles.headline}>{slide.headline}</h2>
      {slide.body ? (
        <div className={styles.bodyBlock}>
          <p className={styles.copy}>{slide.body}</p>
        </div>
      ) : null}
    </>
  );
}
