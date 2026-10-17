import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { useDragCarousel } from '@kernel/front/hooks/useDragCarousel';
import { useFocusTrap } from '@kernel/front/hooks/useFocusTrap';
import { useHistoryBackClose } from '@kernel/front/hooks/useHistoryBackClose';
import { useIsDesktopNav } from '@kernel/front/hooks/useIsDesktopNav';
import { useLockBodyScroll } from '@kernel/front/hooks/useLockBodyScroll';
import { Button } from '@kernel/front/components/ui/Button';
import { CloseIcon } from '@kernel/front/components/ui/CloseIcon';
import { ModalBackdrop } from '@kernel/front/components/ui/ModalBackdrop';
import { OnboardingSlideContent } from './OnboardingSlideContent';
import type { OnboardingSlide } from './onboardingSlides';
import styles from './OnboardingOverlay.module.css';

function PrevChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 3.5 5.5 8 10 12.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface OnboardingOverlayProps {
  slides: OnboardingSlide[];
  onComplete: () => void;
}

/**
 * Full-screen on mobile, compact centered modal on desktop.
 *
 * Platform back, Escape, close, and the backdrop dismiss the whole introduction.
 * Escape, close, backdrop, and the last slide complete immediately. Platform
 * back still goes through the history entry.
 * The previous-slide control is in-panel only (local step state), so React
 * Strict Mode history reclaim cannot auto-complete the tour.
 * Press-drag locks exclusively to one axis: horizontal moves the pager
 * (commit past 30% of width); vertical press-drags the active slide scrollTop.
 */
export function OnboardingOverlay({ slides, onComplete }: OnboardingOverlayProps) {
  const { t } = useLang();
  const isDesktop = useIsDesktopNav();
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stepRef = useRef(0);
  stepRef.current = step;
  const slidePageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLockBodyScroll();
  // Platform back still completes the tour. The close control, Escape, the
  // backdrop and the last slide call onComplete directly: waiting for
  // history.back() left the dialog up and popped the route underneath it,
  // so the shop looked like header and footer with nothing to use.
  useHistoryBackClose(onComplete);
  useFocusTrap(panelRef, { onEscape: onComplete });

  const onIndexChange = useCallback((index: number) => {
    setStep(index);
  }, []);

  const getScrollElement = useCallback(() => slidePageRefs.current[stepRef.current] ?? null, []);

  const { isDragging, dragOffset, trackRef, trackHandlers, prev, goTo } = useDragCarousel({
    count: slides.length,
    index: step,
    onIndexChange,
    commitRatio: 0.3,
    lockHorizontal: true,
    getScrollElement,
  });

  const goNext = useCallback(() => {
    if (stepRef.current >= slides.length - 1) {
      onComplete();
      return;
    }
    setStep((current) => current + 1);
  }, [onComplete, slides.length]);

  const goPrev = useCallback(() => {
    prev();
  }, [prev]);

  const slide = slides[step];
  if (!slide) return null;

  const isLast = step >= slides.length - 1;

  return createPortal(
    <ModalBackdrop
      className={isDesktop ? (styles.backdropDesktop ?? '') : (styles.backdropMobile ?? '')}
      label={slide.title}
      onClose={onComplete}
      closeOnBackdropClick={isDesktop}
    >
      <div
        ref={panelRef}
        className={
          isDesktop ? `${styles.panel} ${styles.panelDesktop}` : `${styles.panel} ${styles.panelMobile}`
        }
        role="document"
        tabIndex={-1}
        data-testid="onboarding-overlay"
      >
        <div className={styles.header}>
          <span className={styles.title}>{slide.title}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onComplete}
            aria-label={t.onboarding.closeAria}
            data-testid="onboarding-close"
            data-modal-close
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.viewport}>
          <div
            ref={trackRef}
            className={isDragging ? `${styles.track} ${styles.trackDragging}` : styles.track}
            style={{
              transform: `translateX(calc(${-step * 100}% + ${dragOffset}px))`,
              transition: isDragging ? 'none' : undefined,
            }}
            {...trackHandlers}
            role="group"
            aria-roledescription="carousel"
            aria-label={t.onboarding.stepAria(step + 1, slides.length)}
          >
            {slides.map((entry, index) => (
              <div
                key={entry.id}
                ref={(node) => {
                  slidePageRefs.current[index] = node;
                }}
                className={styles.slidePage}
                aria-hidden={index !== step}
                data-active={index === step ? 'true' : undefined}
              >
                <OnboardingSlideContent slide={entry} active={index === step} />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.prevSlot}>
            {step > 0 ? (
              <button
                type="button"
                className={styles.prevButton}
                onClick={goPrev}
                aria-label={t.onboarding.prevAria}
                data-testid="onboarding-prev"
              >
                <PrevChevron />
              </button>
            ) : null}
          </div>

          <div
            className={styles.stepper}
            role="group"
            aria-label={t.onboarding.stepAria(step + 1, slides.length)}
          >
            {slides.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={index === step ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                onClick={() => goTo(index)}
                aria-current={index === step ? true : undefined}
                aria-label={t.onboarding.stepAria(index + 1, slides.length)}
                data-testid="onboarding-step"
                data-step={index + 1}
              />
            ))}
          </div>

          <Button type="button" className={styles.nextButton} onClick={goNext} data-testid="onboarding-next">
            {isLast ? t.onboarding.doneLabel : t.onboarding.nextLabel}
          </Button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
