import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath, stripLangPrefix } from '../../config/i18nRoutes';
import { useAuthSession } from '../../state/AuthContext';
import { useCartData } from '../../hooks/useCart';
import { useOrdersTabEntry } from '../../hooks/useOrdersTabEntry';
import { useIsDesktopNav } from '../../hooks/useIsDesktopNav';
import { LoadingModal } from '../ui/LoadingModal';
import { AccountIcon } from './AccountIcon';
import { GiftIcon } from './GiftIcon';
import { adminPath } from '../../utils/adminRoute';
import { GALLERY_PATH, HOME_PATH } from '../../config/paths';
import { useGiftLock } from '../../hooks/useGiftLock';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import { useStorefrontBootstrap } from '../../plugins/StorefrontBootstrap';
import { receiverFollowsOrder } from '../../api/gift';
import { formatCartItemCount } from '../../utils/cartDisplayName';
import styles from './MobileTabBar.module.css';

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.2 7.4 8 2.5l5.8 4.9v5.4c0 .7-.5 1.2-1.2 1.2H3.4c-.7 0-1.2-.5-1.2-1.2V7.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6.2 14v-3.6h3.6V14" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="9.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.4" cy="5.6" r="1.1" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M3.2 10.8 6.6 7.6a1 1 0 0 1 1.3 0l1.5 1.4M10 8.4l1.1-1a1 1 0 0 1 1.3 0l1.4 1.3"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 2h1.2l.9 8.1a1.4 1.4 0 0 0 1.4 1.25h6.2a1.4 1.4 0 0 0 1.38-1.16l.82-4.7H4.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.2" cy="13.4" r="1" fill="currentColor" />
      <circle cx="11" cy="13.4" r="1" fill="currentColor" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 2h8v11.5l-1.3-.9-1.2.9-1.2-.9-1.3.9-1.2-.9-1.2.9-1.3-.9V2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Pages that get their own top/bottom LegalPageBackLink instead — content
 * you drill into and back out of rather than a tab-bar destination. Four of
 * the public content pages retain route-scoped floating cart access whenever
 * the cart has items (CartControl.tsx); /contact (its chat view shouldn't
 * compete with a floating cart) and legal documents deliberately do not.
 * Gallery/Cart/Commandes are the three actual tabs and always keep the bar —
 * /orders and /orders/history are deliberately absent from this set for that
 * reason. After Julie confirms, Galerie is swapped for Accueil and `/home`
 * stays in this bar (see followOrder below). */
const HIDDEN_PATHS = new Set([
  '/',
  '/home',
  '/sizes',
  '/capsules',
  '/pose',
  '/contact',
  '/about',
  '/account',
  '/account/addresses',
  '/account/payment-methods',
  '/account/loyalty',
  '/account/notifications',
  '/account/confirm-email',
  '/account/manage-order',
  '/legal',
  '/privacy',
  '/terms',
  '/sales-terms',
  '/accessibility',
  '/sitemap',
  // Full-screen Leaflet/Mondial Relay widget — a fixed bottom bar overlapping
  // its own map/picker chrome is more clutter than navigation there.
  '/account/addresses/mondial-relay',
]);

/** /register's "check your email" success screen (RegisterLocationState's
 * `done` flag, RegisterPage.tsx) is a terminal screen too — hidden the same
 * way, but only once actually reached (path alone can't tell registration
 * form from success screen; both live at /register). */
function isRegisterSuccessScreen(location: ReturnType<typeof useLocation>): boolean {
  return (
    stripLangPrefix(location.pathname).rest === '/register' &&
    (location.state as { done?: boolean } | null)?.done === true
  );
}

/**
 * Mobile-only app-style bottom tab bar: Galerie / Panier / Commandes. Takes
 * over the hamburger's own Gallery+Cart links (see Header.tsx, which filters
 * 'gallery' out of the items passed to MobileNav). CartControl provides a
 * floating fallback only on public pages where this bar is hidden.
 */
export function MobileTabBar() {
  const { t, lang } = useLang();
  const location = useLocation();
  const { status } = useAuthSession();
  const { cartCount } = useCartData();
  const { awaiting, openOrdersTab } = useOrdersTabEntry();
  const isDesktop = useIsDesktopNav();
  const { shopLocked, originBlocked, lock } = useGiftLock();
  const gift = useOptionalGiftReceiver();
  const bootstrap = useStorefrontBootstrap();
  const followOrder = receiverFollowsOrder(gift.summary?.status) || Boolean(lock?.followLocked);
  const bottomBarMenus = [...bootstrap.menus]
    .filter((item) => item.visible && item.bottomBar)
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const plugin = bootstrap.plugins.find((entry) => entry.id === item.pluginId && entry.enabled);
      const route = plugin?.route;
      if (!route) return [];
      return [{ key: item.key, label: item.label, to: localizedPath(route, lang) }];
    });
  const pathRest = stripLangPrefix(location.pathname).rest;
  const isHiddenRoute =
    originBlocked ||
    (HIDDEN_PATHS.has(pathRest) && !(followOrder && pathRest === HOME_PATH)) ||
    location.pathname.startsWith(adminPath()) ||
    isRegisterSuccessScreen(location);

  const rootRef = useRef<HTMLElement | null>(null);

  // Publishes this bar's real rendered height as --tab-bar-height, consumed
  // by AuthPage.module.css / global.css so bottom-pinned content reserves
  // exactly enough space and nothing ends up hidden underneath it. Forced to
  // 0 on desktop, and on HIDDEN_PATHS routes, rather than left to the
  // observer alone — a display:none element never fires a resize callback,
  // so crossing the breakpoint or navigating onto/off a hidden route would
  // otherwise leave a stale non-zero value in place.
  useEffect(() => {
    if (isDesktop || isHiddenRoute) {
      document.documentElement.style.setProperty('--tab-bar-height', '0px');
      return;
    }
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      document.documentElement.style.setProperty('--tab-bar-height', `${entry.contentRect.height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDesktop, isHiddenRoute]);

  if (isHiddenRoute) return null;

  const browsePath = localizedPath(followOrder ? HOME_PATH : GALLERY_PATH, lang);
  const cartPath = localizedPath('/cart', lang);
  const ordersPath = localizedPath('/orders', lang);
  const isBrowseActive = location.pathname === browsePath;
  const isCartActive = location.pathname === cartPath;
  const cartTabLabel = followOrder ? t.gift.followTitle : t.cart.iconAria;
  const cartTabAria =
    !followOrder && cartCount > 0
      ? `${cartTabLabel}, ${formatCartItemCount(cartCount, t, lang)}`
      : cartTabLabel;
  // Signed out, this tab's destination is /login (openOrdersTab, below) —
  // so it should read as "active" across the whole auth flow it leads into
  // (register is reached from there), not just /login
  // itself. Signed in, it's the usual /orders(/*) match.
  const isOrdersActive =
    status === 'anonymous'
      ? [
          localizedPath('/login', lang),
          localizedPath('/register', lang),
          localizedPath('/forgot-password', lang),
        ].includes(location.pathname)
      : location.pathname === ordersPath || location.pathname.startsWith(`${ordersPath}/`);

  return (
    <>
      <nav ref={rootRef} className={styles.bar} aria-label={t.navAria}>
        <Link
          to={browsePath}
          className={isBrowseActive ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          aria-current={isBrowseActive ? 'page' : undefined}
          data-testid={followOrder ? 'tab-bar-home' : 'tab-bar-gallery'}
        >
          <span className={styles.tabContent}>
            <span className={styles.tabIconWrap}>{followOrder ? <HomeIcon /> : <GalleryIcon />}</span>
            <span className={styles.tabLabel}>{followOrder ? t.nav.home : t.nav.gallery}</span>
          </span>
        </Link>
        {bottomBarMenus.map((item) => {
          const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.key}
              to={item.to}
              className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              aria-current={active ? 'page' : undefined}
              data-testid={`tab-bar-${item.key}`}
            >
              <span className={styles.tabContent}>
                <span className={styles.tabIconWrap}>
                  <GalleryIcon />
                </span>
                <span className={styles.tabLabel}>{item.label}</span>
              </span>
            </Link>
          );
        })}
        <Link
          to={cartPath}
          className={[
            styles.tab,
            isCartActive && styles.tabActive,
            // Only while browsing elsewhere — the active pill already reads
            // as "you're here"; animating on top of it would fight that.
            cartCount > 0 && !isCartActive && styles.tabHasItems,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={cartTabAria}
          aria-current={isCartActive ? 'page' : undefined}
          data-testid="tab-bar-cart"
        >
          <span className={styles.tabContent}>
            <span className={styles.tabIconWrap}>
              <span className={styles.cartIconGlyph}>
                {followOrder ? <GiftIcon size={18} /> : <CartIcon />}
                {cartCount > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {cartCount}
                  </span>
                )}
              </span>
            </span>
            <span className={styles.tabLabel} aria-hidden="true">
              {cartTabLabel}
            </span>
          </span>
        </Link>
        {!shopLocked && (
          <button
            type="button"
            className={[
              styles.tab,
              isOrdersActive && styles.tabActive,
              status === 'anonymous' && styles.tabLogin,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={isOrdersActive ? 'page' : undefined}
            data-testid="tab-bar-orders"
            aria-label={status === 'anonymous' ? t.auth.submitLogin : t.nav.ordersTab}
            onClick={openOrdersTab}
          >
            <span className={styles.tabContent}>
              <span className={styles.tabIconWrap}>
                {status === 'anonymous' ? <AccountIcon size={18} /> : <OrdersIcon />}
              </span>
              <span className={styles.tabLabel}>
                {status === 'anonymous' ? t.auth.submitLogin : t.nav.ordersTab}
              </span>
            </span>
          </button>
        )}
      </nav>
      {awaiting && <LoadingModal message={t.nav.loadingAccount} />}
    </>
  );
}
