import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { useBackendHealth } from '../../hooks/useBackendHealth';
import { Header } from './Header';
import { Footer } from './Footer';
import { MaintenanceBanner } from './MaintenanceBanner';
import { CartBanner } from './CartBanner';
import { MobileTabBar } from './MobileTabBar';
import { RouteFocusAnnounce } from './RouteFocusAnnounce';
import { ServiceDisruptedNotice } from './ServiceDisruptedNotice';
import { MainAreaFallback } from './MainAreaFallback';
import { GALLERY_PATH, HOME_PATH } from '../../config/paths';
import { localizedPath, stripLangPrefix } from '../../config/i18nRoutes';
import { isMobileBackPage, isMobileBackViewport } from '../../utils/mobileBackNavigation';
import { captureSplashResume, shouldPlaySplashEntry } from '../../state/splashEntryGate';
import { touchCartSpaActivity } from '../../state/cartBootstrapCache';
import { scrollWindowInstant } from '../../utils/scroll';
import { isGalleryLightboxRestorePending } from '../../state/galleryLightboxRestorePending';
import { adminPath } from '../../utils/adminRoute';
import { beginAuthLegalDetour, shouldResumeCartAuthDraft } from '../../state/authConsentDraft';
import {
  CHECKOUT_SESSION_EXPIRED_NOTICE_KEY,
  CHECKOUT_SESSION_EXPIRED_NOTICE_MINUTES_KEY,
  CHECKOUT_SESSION_WARNING_LEAD_MINUTES,
  isCheckoutSessionWarningActive,
  subscribeCheckoutSessionWarning,
  touchCheckoutPrivacySession,
} from '../../state/checkoutPrivacySession';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useGiftLock } from '../../hooks/useGiftLock';
import {
  giftReceiverTokenFromPath,
  giftShopResumePath,
  isGiftGiverPath,
  isGiftReceiverBlockedPath,
} from '../../state/giftLockSession';

/** Auth + onboarding UI are not needed to hydrate prerendered pages — keep them
 * out of the entry chunk (see vite.config.ts build notes). Neither are the gift
 * banner and blocked-origin page, which only a gift session ever shows. */
const GlobalAuthModal = lazy(() =>
  import('../auth/GlobalAuthModal').then((m) => ({ default: m.GlobalAuthModal })),
);
const OnboardingController = lazy(() =>
  import('../onboarding/OnboardingController').then((m) => ({ default: m.OnboardingController })),
);
const GiftLockBanner = lazy(() =>
  import('../gift/GiftLockBanner').then((m) => ({ default: m.GiftLockBanner })),
);
const GiftContinueNotice = lazy(() =>
  import('../gift/GiftContinueNotice').then((m) => ({ default: m.GiftContinueNotice })),
);

const mode = import.meta.env.MODE;
const isPreprod = mode === 'preprod';
const INTRO_SURFACE_PATHS = new Set(['/home', '/sizes', '/pose', '/about', '/capsules']);

function rendersCartBannerInsideIntroSurface(pathname: string): boolean {
  const { rest } = stripLangPrefix(pathname);
  return INTRO_SURFACE_PATHS.has(rest);
}

function isCartPath(pathname: string): boolean {
  return stripLangPrefix(pathname).rest === '/cart';
}

function isCartResumePath(path: string): boolean {
  try {
    return isCartPath(new URL(path, 'https://invalid.local').pathname);
  } catch {
    return false;
  }
}

function isLegalAuthDetourPath(pathname: string): boolean {
  const { rest } = stripLangPrefix(pathname);
  return rest === '/terms' || rest === '/privacy';
}

/** Keeps the cart bootstrap cache warm while the customer uses the shop in
 * this tab (route changes + returning to a visible tab). Memory-only — see
 * cartBootstrapCache.ts / VITE_CART_PAGE_CACHE_TTL. */
function SpaActivityTracker() {
  const location = useLocation();

  useEffect(() => {
    touchCartSpaActivity();
    touchCheckoutPrivacySession();
  }, [location.pathname]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        touchCartSpaActivity();
        touchCheckoutPrivacySession();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const onInteraction = (event: Event) => {
      if (event.isTrusted) touchCheckoutPrivacySession();
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'input', 'change', 'wheel'];
    for (const event of events) window.addEventListener(event, onInteraction, { passive: true });
    return () => {
      for (const event of events) window.removeEventListener(event, onInteraction);
    };
  }, []);

  return null;
}

/** Bottom-tab destinations remember scroll even on a new history push
 * (gallery ↔ cart). Everything else is a new screen and opens at the top. */
function remembersScrollOnPush(pathname: string): boolean {
  const { rest } = stripLangPrefix(pathname);
  return rest === '/gallery' || rest === '/cart' || rest === '/orders' || rest.startsWith('/orders/');
}

function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const pathnameRef = useRef(location.pathname);
  const locationStateRef = useRef(location.state);
  const navigationTypeRef = useRef(navigationType);
  const positionsRef = useRef(new Map<string, number>());
  const restoringRef = useRef(false);
  locationStateRef.current = location.state;
  navigationTypeRef.current = navigationType;

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      if (restoringRef.current) return;
      positionsRef.current.set(pathnameRef.current, window.scrollY);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    // Only react to actual route changes — not to HomePage clearing its
    // scrollTo state afterward, which would otherwise re-fire this effect
    // and yank the page back to the top right after the section scroll.
    const state = locationStateRef.current as { scrollTo?: string } | null;
    if (state?.scrollTo) return;
    const path = location.pathname;
    if (
      navigationTypeRef.current === 'POP' &&
      (isGalleryLightboxRestorePending() ||
        typeof (window.history.state as { galleryLightboxProductUid?: unknown } | null)
          ?.galleryLightboxProductUid === 'string')
    ) {
      // Size-guide Back: GalleryGrid jumps to that product before paint.
      // Applying a saved window offset here (often 0 on desktop) would
      // leave the zoom modal waiting on a card that is not mounted yet.
      pathnameRef.current = path;
      restoringRef.current = false;
      return;
    }
    const y =
      navigationTypeRef.current === 'POP' || remembersScrollOnPush(path)
        ? (positionsRef.current.get(path) ?? 0)
        : 0;
    // Point the scroll listener at the new path *before* restoring, so the
    // jump cannot overwrite the previous page's saved offset.
    pathnameRef.current = path;
    restoringRef.current = true;
    scrollWindowInstant(y);
    // Cart (and other lazy routes) may still be short on this frame. Re-apply
    // the captured offset after paint; ignore scroll events until then so a
    // clamped jump cannot save 0 over the real position.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (pathnameRef.current === path) scrollWindowInstant(y);
        restoringRef.current = false;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      restoringRef.current = false;
    };
  }, [location.pathname]);

  return null;
}

/** If browser/gesture Back lands on another mobile detail page, continue
 * through the old entries until the last bottom-tab page is reached. New
 * in-app detail-to-detail navigation is replaced at its source (MobileNav,
 * useNavItems/useSectionNav), while this POP guard also heals stacks made
 * before that rule or through browser-level navigation. */
function MobileBackHistoryGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const previousLocationRef = useRef({ key: location.key, pathname: location.pathname });

  useEffect(() => {
    const previousLocation = previousLocationRef.current;
    previousLocationRef.current = { key: location.key, pathname: location.pathname };
    if (
      navigationType === 'POP' &&
      previousLocation.key !== location.key &&
      isMobileBackViewport() &&
      isMobileBackPage(previousLocation.pathname) &&
      isMobileBackPage(location.pathname)
    ) {
      navigate(-1);
    }
  }, [location.key, location.pathname, navigate, navigationType]);

  return null;
}

/** Live height of everything above <main> (header + whichever of
 * MaintenanceBanner/CartBanner happen to be showing), published as
 * --chrome-height on the root element. --header-height (tokens.css) is only
 * the header's own nominal height — pages that size themselves against "the
 * viewport minus the chrome" (e.g. AuthPage.module.css's forced min-height,
 * meant to vertically center a short form) used that alone, so a banner
 * appearing added its height on top of an already-100%-tall section instead
 * of shrinking it, forcing a scroll to reach a submit button that had
 * nothing but blank space below it. ResizeObserver picks up banners
 * mounting/unmounting (MaintenanceBanner's time window, CartBanner's
 * cartCount) the same way it picks up window resizes. */
function useChromeHeight() {
  const chromeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = chromeRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      document.documentElement.style.setProperty('--chrome-height', `${entry.contentRect.height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return chromeRef;
}

/** Checkbox labels often delegate their click to a visually-hidden native
 * input. Since those inputs deliberately suppress mouse focus, mobile Safari
 * can leave the preceding text field focused and restore its keyboard after
 * the checkbox state updates. Blur that field at pointer-down, whether the
 * customer taps the checkbox itself or any part of its label. The document
 * listener also covers checkboxes rendered in portal-based modals. */
function useBlurTextFieldOnCheckboxTap() {
  useEffect(() => {
    function blurFocusedField(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      const directCheckbox = event.target.closest<HTMLInputElement>('input[type="checkbox"]');
      const label = event.target.closest('label');
      const labelledCheckbox = label instanceof HTMLLabelElement ? label.control : null;
      const checkbox = directCheckbox ?? labelledCheckbox;
      if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== 'checkbox' || checkbox.disabled)
        return;

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        activeElement.blur();
      }
    }

    document.addEventListener('pointerdown', blurFocusedField, true);
    return () => document.removeEventListener('pointerdown', blurFocusedField, true);
  }, []);
}

/** Shown only while a lazy route's chunk is in flight — page-shaped skeleton
 * (not a spinner): these chunks are same-origin and often already preloaded,
 * so a spinner would flash more often than it would inform. The min-height
 * keeps the footer from jumping up the page during the swap. */
function RouteFallback() {
  return <MainAreaFallback />;
}

interface LayoutProps {
  /** Injected by App so the shell can preserve cart state without importing a route. */
  cartPage: ReactNode;
  preprodUnavailable: ReactNode;
}

export function Layout({ cartPage, preprodUnavailable }: LayoutProps) {
  const { t, lang } = useLang();
  const [checkoutExpiredNotice, setCheckoutExpiredNotice] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(CHECKOUT_SESSION_EXPIRED_NOTICE_KEY) === '1',
  );
  const [checkoutExpiredMinutes] = useState(() => {
    const raw =
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(CHECKOUT_SESSION_EXPIRED_NOTICE_MINUTES_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  });

  useEffect(() => {
    if (checkoutExpiredNotice) {
      window.sessionStorage.removeItem(CHECKOUT_SESSION_EXPIRED_NOTICE_KEY);
      window.sessionStorage.removeItem(CHECKOUT_SESSION_EXPIRED_NOTICE_MINUTES_KEY);
    }
  }, [checkoutExpiredNotice]);
  // Warns a guest before the session's idle expiry wipes what they typed, with
  // one action to keep going (RGAA 13.1). Any other activity also extends the
  // session and dismisses it; without any, the expiry notice above follows.
  const checkoutExpiryWarning = useSyncExternalStore(
    subscribeCheckoutSessionWarning,
    isCheckoutSessionWarningActive,
    () => false,
  );
  const location = useLocation();
  const chromeRef = useChromeHeight();
  useBlurTextFieldOnCheckboxTap();
  // Health is probed on route changes; apiFetch also awaits /healthz after
  // network/5xx and publishes `down` when confirmed. While down, recovery
  // polling restores the site when /healthz comes back.
  // Preprod's backend is intentionally switched off between work sessions —
  // look like nothing's deployed (bare NotFound, no chrome). Local Vite and
  // prod show the informative ServiceDisruptedNotice instead.
  const backendStatus = useBackendHealth();
  const down = backendStatus === 'down';
  // Admin is its own self-contained app shell (AdminLayout: top bar, desktop
  // sidebar, mobile bottom nav) — the public site chrome underneath it would
  // just double up (two headers, a customer-facing footer under an admin
  // screen). MobileTabBar already self-hides the same way; folded in here
  // too so every public chrome element follows one rule.
  const isAdminRoute = location.pathname.startsWith(adminPath());
  const { lock, shopLocked, originBlocked } = useGiftLock();
  const cartBannerIsInsideIntroSurface = rendersCartBannerInsideIntroSurface(location.pathname);
  const onCart = isCartPath(location.pathname);
  const onLegalAuthDetour = isLegalAuthDetourPath(location.pathname);
  // Same contract as AuthModal.suspended: keep the cart React tree alive while
  // the real Terms/Privacy page is shown from Identification CGU links.
  const suspendCartAuth = onLegalAuthDetour && shouldResumeCartAuthDraft();
  const holdCartPage =
    onCart || suspendCartAuth || (shopLocked && isCartResumePath(giftShopResumePath() ?? ''));

  useEffect(() => {
    if (suspendCartAuth) beginAuthLegalDetour();
  }, [suspendCartAuth]);

  if (down && isPreprod) {
    return preprodUnavailable;
  }

  // Bookmarks / favorites: force `/` while this document still owes a splash.
  // `prepareSplashColdEntry` normally rewrote already; this is the in-app net.
  // Giver claim URLs must not be parked behind `/` — a lost resume sends
  // an unauthenticated visitor to Accueil/gallery instead of `/cart`.
  if (shouldPlaySplashEntry() && location.pathname !== '/' && !isGiftGiverPath(location.pathname)) {
    const pathToken = giftReceiverTokenFromPath(location.pathname);
    const giftResume = pathToken && lock?.receiverToken === pathToken ? giftShopResumePath() : null;
    if (giftResume) {
      const url = new URL(giftResume, window.location.origin);
      captureSplashResume(url.pathname, url.search, url.hash);
    } else if (!pathToken) {
      captureSplashResume(location.pathname, location.search, location.hash);
    }
    return <Navigate to="/" replace />;
  }

  // No redirect while the API is down: ServiceDisruptedNotice below takes the
  // page's place under the page's own URL, and the page comes back by itself
  // when /healthz recovers. Sending every route to Accueil instead made any
  // render that could not reach the API (Googlebot's, for one) a copy of the
  // home page, canonical included.

  if (
    shopLocked &&
    lock &&
    !shouldPlaySplashEntry() &&
    !isGiftGiverPath(location.pathname) &&
    !isAdminRoute &&
    isGiftReceiverBlockedPath(location.pathname)
  ) {
    return <Navigate to={localizedPath(lock.followLocked ? HOME_PATH : GALLERY_PATH, lang)} replace />;
  }

  const splashOwnsUnavailableRoot = down && location.pathname === '/' && shouldPlaySplashEntry();

  return (
    <>
      <a className="skipLink" href="#main">
        {t.skip}
      </a>
      {/* The footer (legal pages, sitemap, accessibility statement) stays one
          keystroke away even while the gallery keeps loading more cards. */}
      {!isAdminRoute && (
        <a className="skipLink" href="#footer">
          {t.skipFooter}
        </a>
      )}
      <RouteFocusAnnounce />
      <ScrollToTop />
      <SpaActivityTracker />
      <MobileBackHistoryGuard />
      <div ref={chromeRef}>
        {!isAdminRoute && <Header />}
        {!isAdminRoute && <MaintenanceBanner />}
        {!isAdminRoute && shopLocked && (
          <Suspense fallback={null}>
            <GiftLockBanner />
          </Suspense>
        )}
        {!isAdminRoute && !shopLocked && !originBlocked && !cartBannerIsInsideIntroSurface && <CartBanner />}
      </div>
      {/* Suspense sits here, around the page area only, so the lazily-loaded
          account/cart/orders routes (see App.tsx) never blank out the header,
          banners or footer while their chunk arrives. */}
      <main id="main" tabIndex={-1}>
        {down && !splashOwnsUnavailableRoot ? (
          <ServiceDisruptedNotice />
        ) : (
          <>
            {originBlocked && !shouldPlaySplashEntry() ? (
              <Suspense fallback={null}>
                <GiftContinueNotice />
              </Suspense>
            ) : (
              <>
                {/* Gift splash keeps this tree mounted but hidden. `data-cart-hold`
                    lets the cart recap remeasure when `display: none` is cleared. */}
                {holdCartPage && (
                  <div
                    data-cart-hold=""
                    style={onCart ? undefined : { display: 'none' }}
                    aria-hidden={onCart ? undefined : true}
                  >
                    <Suspense fallback={onCart ? <RouteFallback /> : null}>{cartPage}</Suspense>
                  </div>
                )}
                {!onCart && (
                  <Suspense fallback={<RouteFallback />}>
                    <Outlet />
                  </Suspense>
                )}
              </>
            )}
          </>
        )}
      </main>
      {!isAdminRoute && <Footer />}
      <MobileTabBar />
      {!shopLocked && !originBlocked && (
        <Suspense fallback={null}>
          <GlobalAuthModal />
        </Suspense>
      )}
      {!shopLocked && !originBlocked && (
        <Suspense fallback={null}>
          <OnboardingController />
        </Suspense>
      )}
      {checkoutExpiredNotice && (
        <ConfirmModal
          title={t.checkoutSessionExpired.title}
          message={t.checkoutSessionExpired.message(checkoutExpiredMinutes)}
          confirmLabel={t.checkoutSessionExpired.continue}
          closeLabel={t.checkoutSessionExpired.continue}
          onConfirm={() => setCheckoutExpiredNotice(false)}
          onCancel={() => setCheckoutExpiredNotice(false)}
          variant="dialog"
        />
      )}
      {!isAdminRoute && checkoutExpiryWarning && (
        <ConfirmModal
          title={t.checkoutSessionExpired.warningTitle}
          message={t.checkoutSessionExpired.warningMessage.replace(
            '{n}',
            String(CHECKOUT_SESSION_WARNING_LEAD_MINUTES),
          )}
          confirmLabel={t.checkoutSessionExpired.continue}
          onConfirm={touchCheckoutPrivacySession}
          onCancel={touchCheckoutPrivacySession}
          variant="dialog"
          closeIcon={false}
        />
      )}
    </>
  );
}
