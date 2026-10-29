import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BootSplash } from '../components/boot/BootSplash';
import { bootSplashExitAfterMs } from '../components/boot/splashTiming';
import { CORE_FRONT_VIEWS, PluginView } from '../plugins/PluginHost';
import { useLang } from '../assets/i18n';
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { localizeIfBare } from '../config/i18nRoutes';
import { shopConfig } from '../config/env';
import {
  hasRuntimeDefaultLang,
  hasRuntimeFirstVisit,
  runtimeFirstVisit,
} from '../config/runtimeI18n';
import { useCartData } from '../hooks/useCart';
import { useIsDesktopNav } from '../hooks/useIsDesktopNav';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { delay } from '../utils/withMinDuration';
import { useAuthSession } from '../state/AuthContext';
import { preloadGalleryBoot } from '../state/galleryBootCache';
import { readGiftLockSession, readGiftOriginBlock } from '../state/giftLockSession';
import {
  defaultSplashDestination,
  markSplashEntryCompleted,
  resolveSplashExitPath,
  setSplashEntryActive,
  shouldPlaySplashEntry,
} from '../state/splashEntryGate';
import styles from './SplashEntry.module.css';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * `/` entry only: motion as the page body, then replace-navigate to the
 * cold-load URL the user actually opened (any route), or — when they opened
 * bare `/` — localized `/home` (desktop) / `/gallery` (mobile). Auth guards
 * still protect the resumed route afterward.
 */
export function SplashEntry() {
  const { status } = useAuthSession();
  const { cartReady } = useCartData();
  const { langReady, t } = useLang();
  const isDesktop = useIsDesktopNav();
  const navigate = useNavigate();

  // Prefer a live resolve at exit so preferSplashExitPath (admin session
  // mid-intro) can still steer the landing without remounting SplashEntry.
  const destinationRef = useRef<string | undefined>(undefined);
  if (destinationRef.current === undefined) {
    destinationRef.current =
      typeof window !== 'undefined' && shouldPlaySplashEntry()
        ? resolveSplashExitPath(isDesktop)
        : defaultSplashDestination(isDesktop);
  }

  const exitDestination = useCallback(
    () =>
      typeof window !== 'undefined' && shouldPlaySplashEntry()
        ? resolveSplashExitPath(isDesktop)
        : (destinationRef.current ?? defaultSplashDestination(isDesktop)),
    [isDesktop],
  );

  // SSR prerender of `/` paints the splash shell; the browser cold load
  // replays it via shouldPlaySplashEntry(). Soft revisits of `/` after the
  // intro skip straight to the destination Navigate below.
  const [showSplash, setShowSplash] = useState(() =>
    typeof window === 'undefined' ? true : shouldPlaySplashEntry(),
  );
  const [animationDone, setAnimationDone] = useState(() => prefersReducedMotion());
  const instant = useMemo(() => prefersReducedMotion(), []);
  // Motion + end hold (see bootSplashEndHoldMs) so the final frame is visible.
  const exitAfterMs = useMemo(() => bootSplashExitAfterMs(), []);
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const finishingRef = useRef(false);

  useLockBodyScroll(showSplash);

  useEffect(() => {
    setSplashEntryActive(showSplash);
    return () => setSplashEntryActive(false);
  }, [showSplash]);

  useEffect(() => {
    if (!showSplash) return;
    // Gift lock uses gift catalogue APIs; do not warm the priced shop feed.
    if (readGiftLockSession() || readGiftOriginBlock()) return;
    preloadGalleryBoot(preferredLanguage());
  }, [showSplash]);

  useEffect(() => {
    if (!showSplash || !langReady) return;
    if (instant) {
      setAnimationDone(true);
      return;
    }
    const timer = window.setTimeout(() => setAnimationDone(true), exitAfterMs);
    return () => window.clearTimeout(timer);
  }, [showSplash, langReady, instant, exitAfterMs]);

  // When `i18n.firstVisit=default`, bare `/` must not exit on build-time `en`
  // before bootstrap applies the shop default.
  const bootstrapI18nReady =
    hasRuntimeFirstVisit() &&
    (runtimeFirstVisit() !== 'default' || hasRuntimeDefaultLang());

  useEffect(() => {
    if (!showSplash || finishingRef.current) return;
    let cancelled = false;

    async function finish() {
      const authSettled = status !== 'loading';
      if (!(authSettled && cartReady && langReady && bootstrapI18nReady && animationDone)) return;

      if (typeof document !== 'undefined' && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Font failure must not trap the splash.
        }
      }
      if (cancelled || finishingRef.current) return;

      if (instant) {
        const elapsed =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAtRef.current;
        const remaining = shopConfig.loadingMinMs.normal - elapsed;
        if (remaining > 0) await delay(remaining);
        if (cancelled || finishingRef.current) return;
      }

      finishingRef.current = true;
      const dest = localizeIfBare(exitDestination(), preferredLanguage());
      destinationRef.current = dest;
      markSplashEntryCompleted();
      setShowSplash(false);
      navigate(dest, { replace: true });
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [
    showSplash,
    status,
    cartReady,
    langReady,
    bootstrapI18nReady,
    animationDone,
    instant,
    exitDestination,
    navigate,
  ]);

  useEffect(() => {
    if (!showSplash) return;
    const safetyMs = Math.max(12_000, exitAfterMs + 4_000);
    const safety = window.setTimeout(() => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const dest = localizeIfBare(exitDestination(), preferredLanguage());
      destinationRef.current = dest;
      markSplashEntryCompleted();
      setShowSplash(false);
      navigate(dest, { replace: true });
    }, safetyMs);
    return () => window.clearTimeout(safety);
  }, [showSplash, exitAfterMs, exitDestination, navigate]);

  if (showSplash) {
    // An enabled plugin owning `view.boot.splash` replaces the kernel
    // BootSplash. Copy/timing go through SlotPropsContext (`useSlotProps`) so
    // the replacement keeps the kernel's RGAA labels and reduced-motion
    // behavior: ariaLabel, markAria, tagline, instant, speed.
    const splashProps = {
      ariaLabel: t.bootSplash.ariaLabel,
      markAria: t.bootSplash.nailFanAria,
      tagline: t.bootSplash.tagline,
      instant,
      speed: shopConfig.bootSplashSpeed,
    };
    return (
      <div className={styles.stage}>
        <PluginView
          name={CORE_FRONT_VIEWS.bootSplash}
          props={splashProps}
          fallback={
            <BootSplash
              ariaLabel={splashProps.ariaLabel}
              markAria={splashProps.markAria}
              tagline={splashProps.tagline}
              instant={splashProps.instant}
            />
          }
        />
      </div>
    );
  }

  return (
    <Navigate
      to={destinationRef.current ?? localizeIfBare(defaultSplashDestination(isDesktop), preferredLanguage())}
      replace
    />
  );
}
