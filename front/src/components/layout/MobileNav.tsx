import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useAuthSession, useAuthCommands } from '../../state/AuthContext';
import { useCartData } from '../../hooks/useCart';
import { useGiftLock } from '../../hooks/useGiftLock';
import { useIsDesktopNav } from '../../hooks/useIsDesktopNav';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ContrastControl } from '../ui/ContrastControl';
import { LoadingModal } from '../ui/LoadingModal';
import { ThemeSwitch } from '../ui/ThemeSwitch';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import styles from './MobileNav.module.css';
import { isNavItemActive, navLinkClickHandler, type NavItem } from './navItems';
import { GALLERY_PATH, HOME_PATH } from '../../config/paths';
import { shopConfig } from '../../config/env';
import { isMobileBackViewport, shouldReplaceMobileBackPage } from '../../utils/mobileBackNavigation';
import { withMinDuration } from '../../utils/withMinDuration';
import { adminPath } from '../../utils/adminRoute';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useDragScroll } from '../../hooks/useDragScroll';
import { usePluginEnabled } from '../../plugins/StorefrontBootstrap';

interface MobileNavProps {
  id?: string;
  open: boolean;
  items: NavItem[];
  onNavigate: () => void;
}

/** Which collapsible group (Guide/Info/Mon compte) is expanded, remembered
 * client-side only — no server round-trip for a UI preference this minor.
 * Empty string means "explicitly collapsed all" (distinct from unset). */
const OPEN_GROUP_STORAGE_KEY = 'psn-mobile-nav-group';
const DEFAULT_OPEN_GROUP = 'info';

function readStoredOpenGroup(): string | null {
  if (typeof window === 'undefined') return DEFAULT_OPEN_GROUP;
  const stored = window.localStorage.getItem(OPEN_GROUP_STORAGE_KEY);
  if (stored === null) return DEFAULT_OPEN_GROUP;
  return stored === '' ? null : stored;
}

export function MobileNav({ id, open, items, onNavigate }: MobileNavProps) {
  const loyaltyOn = usePluginEnabled('commerce-loyalty');
  const { t, lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, isImpersonating } = useAuthSession();
  const { logout, stopImpersonating } = useAuthCommands();
  const { cartCount } = useCartData();
  const { originBlocked } = useGiftLock();
  const isDesktop = useIsDesktopNav();
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Covers the POST /auth/logout round trip + local session clearing —
  // navigating before it settles left the bottom nav bar briefly still
  // showing the signed-in state on the page it landed on.
  const [loggingOut, setLoggingOut] = useState(false);
  // Only one of Guide/Info/Mon compte open at a time — Guide starts closed
  // (least urgent), Info starts open; see readStoredOpenGroup for the
  // client-remembered override once someone actually toggles one.
  const [openGroup, setOpenGroup] = useState<string | null>(readStoredOpenGroup);

  async function handleConfirmLogout() {
    setConfirmLogout(false);
    setLoggingOut(true);
    try {
      await withMinDuration(logout(), shopConfig.loadingMinMs.normal);
    } finally {
      setLoggingOut(false);
    }
    // Same reasoning as authReturnTo's mobile fallback: nothing specific to
    // resume, so land in the gallery instead of Accueil on mobile — desktop
    // keeps going home.
    navigate(localizedPath(isMobileBackViewport() ? GALLERY_PATH : HOME_PATH, lang));
  }
  // Keep the portaled backdrop mounted on mobile so opacity can transition on
  // close (same pattern as the panel: stay in DOM, toggle an open class).
  const mountBackdrop = !isDesktop;
  useLockBodyScroll(open && mountBackdrop);
  const requestClose = useHistoryBackClose(onNavigate, open);

  function toggleGroup(key: string) {
    setOpenGroup((current) => {
      const next = current === key ? null : key;
      window.localStorage.setItem(OPEN_GROUP_STORAGE_KEY, next ?? '');
      return next;
    });
  }

  // Orders and account navigation used to be separate destinations outside
  // the burger menu. Keep both as collapsible groups here for signed-in users.
  const ordersGroup: NavItem | null =
    status === 'anonymous'
      ? null
      : {
          key: 'orders',
          label: t.nav.ordersTab,
          children: [
            { key: 'orders-active', label: t.nav.ordersActive, to: localizedPath('/orders', lang) },
            { key: 'orders-history', label: t.nav.ordersHistory, to: localizedPath('/orders/history', lang) },
          ],
        };

  // Account navigation used to be AccountShell.tsx's own mobile tab strip
  // (removed — see AccountShell.module.css); it lives here instead now, as
  // a group alongside Guide/Info. Orders/order history are deliberately not
  // in it — they're reached from the bottom tab bar's Commandes tab
  // (MobileTabBar.tsx / useOrdersTabEntry.ts), not the hamburger. Signed
  // out, "Se connecter" (loginItem below) takes this same trailing slot
  // instead. 'loading' still shows the account group (resolves quickly) so
  // it doesn't pop in right after status settles.
  const accountGroup: NavItem | null =
    status === 'anonymous'
      ? null
      : {
          key: 'account',
          label: t.nav.myAccount,
          children: [
            { key: 'account-profile', label: t.nav.account, to: localizedPath('/account', lang) },
            {
              key: 'account-addresses',
              label: t.nav.addresses,
              to: localizedPath('/account/addresses', lang),
            },
            {
              key: 'account-payment',
              label: t.nav.paymentMethods,
              to: localizedPath('/account/payment-methods', lang),
            },
            ...(loyaltyOn
              ? [
                  {
                    key: 'account-loyalty',
                    label: t.nav.loyalty,
                    to: localizedPath('/account/loyalty', lang),
                  },
                ]
              : []),
            {
              key: 'account-notifications',
              label: t.nav.notifications,
              to: localizedPath('/account/notifications', lang),
            },
            ...(isImpersonating
              ? [
                  {
                    key: 'stop-impersonating',
                    label: t.admin.stopImpersonating,
                    onClick: () => {
                      stopImpersonating();
                      navigate(adminPath());
                    },
                  },
                ]
              : []),
          ],
        };
  // Its own top-level row, outside the collapsible "Mon compte" group —
  // logging out shouldn't be hidden behind an accordion someone happens to
  // have collapsed.
  const logoutItem: NavItem | null =
    status === 'anonymous'
      ? null
      : { key: 'account-logout', label: t.nav.logout, onClick: () => setConfirmLogout(true), danger: true };
  // Signed-out equivalent of accountGroup's trailing slot — MobileNav only
  // ever renders below the 1024px desktop-nav breakpoint (.panel's own
  // min-width:1024px { display:none }), so this can link straight to
  // /login without the modal-vs-page branching AccountControl needs.
  const loginItem: NavItem | null =
    status === 'anonymous'
      ? { key: 'login', label: t.auth.submitLogin, to: localizedPath('/login', lang) }
      : null;

  const cartItem: NavItem = { key: 'cart', label: t.cart.iconAria, to: localizedPath('/cart', lang) };
  const galleryIndex = items.findIndex((item) => item.key === 'gallery');
  const insertAfter = galleryIndex;
  const withCart =
    originBlocked || insertAfter === -1
      ? items
      : [...items.slice(0, insertAfter + 1), cartItem, ...items.slice(insertAfter + 1)];

  const trailingItems: NavItem[] = originBlocked
    ? []
    : accountGroup
      ? [...(ordersGroup ? [ordersGroup] : []), accountGroup, ...(logoutItem ? [logoutItem] : [])]
      : loginItem
        ? [loginItem]
        : [];
  const panelItems = [...withCart, ...trailingItems];

  // Same drag-to-scroll + "more content" chevron pattern as FilterSheet.tsx
  // (also reused by CartControl's drawer and PhotoLightbox) — a long panel
  // (e.g. the "Mon compte" group pushing the list past the viewport on a
  // small screen) used to have no way to reach its own last entries, since
  // the panel grew taller than the viewport with nothing scrollable.
  const listRef = useRef<HTMLDivElement | null>(null);
  const listDragScroll = useDragScroll<HTMLDivElement>();
  const { scrollHint, updateScrollHint } = useScrollHint(listRef);

  // Re-measure whenever the panel opens (content may have changed while
  // closed, e.g. auth status), the item count itself changes (the "Mon
  // compte" group appearing/disappearing), or a group's accordion state
  // changes (expanding one can turn a short list into a scrollable one),
  // plus on resize. The extra delayed check catches the tail end of the
  // group's own 0.25s open/close transition (MobileNav.module.css).
  useLayoutEffect(() => {
    updateScrollHint();
    const settle = window.setTimeout(updateScrollHint, 260);
    window.addEventListener('resize', updateScrollHint);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', updateScrollHint);
    };
  }, [open, openGroup, panelItems.length, updateScrollHint]);

  return (
    <>
      {mountBackdrop
        ? createPortal(
            <div
              className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`.trim()}
              onClick={open ? requestClose : undefined}
              aria-hidden="true"
            />,
            document.body,
          )
        : null}
      <nav
        id={id}
        inert={!open}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`.trim()}
        data-testid="mobile-nav-panel"
      >
        <div className={styles.listWrap}>
          <div ref={listRef} className={styles.list} onScroll={updateScrollHint} {...listDragScroll}>
            <div className={styles.appearanceSection}>
              <div className={styles.appearanceRow}>
                <div className={styles.appearanceCell}>
                  <span className={styles.appearanceLabel}>{t.account.themeLabel}</span>
                  <ThemeSwitch
                    modes="light-dark"
                    {...(styles.appearanceControl ? { className: styles.appearanceControl } : {})}
                  />
                </div>
                <span className={styles.appearanceDivider} aria-hidden="true" />
                <div className={styles.appearanceCell}>
                  <span className={styles.appearanceLabel}>{t.account.contrastLabel}</span>
                  <ContrastControl
                    modes="standard-more"
                    {...(styles.appearanceControl ? { className: styles.appearanceControl } : {})}
                  />
                </div>
              </div>
            </div>
            <hr className={styles.appearanceSeparator} />
            {panelItems.map((item) => {
              if (item.children) {
                const isOpen = openGroup === item.key;
                return (
                  <div key={item.key} className={styles.group}>
                    <button
                      type="button"
                      className={styles.groupLabel}
                      onClick={() => toggleGroup(item.key)}
                      aria-expanded={isOpen}
                      aria-controls={`mobile-nav-group-${item.key}`}
                    >
                      {item.label}
                      <ChevronIcon
                        className={
                          isOpen
                            ? `${styles.groupChevron ?? ''} ${styles.groupChevronOpen ?? ''}`
                            : (styles.groupChevron ?? '')
                        }
                      />
                    </button>
                    <div
                      id={`mobile-nav-group-${item.key}`}
                      className={
                        isOpen ? `${styles.groupChildren} ${styles.groupChildrenOpen}` : styles.groupChildren
                      }
                      inert={!isOpen}
                    >
                      <div className={styles.groupChildrenInner}>
                        {item.children.map((child) => {
                          const childActive = isNavItemActive(child, location.pathname);
                          const className = [
                            styles.childLink,
                            childActive && styles.linkActive,
                            child.danger && styles.childLinkDanger,
                          ]
                            .filter(Boolean)
                            .join(' ');
                          return child.to ? (
                            <Fragment key={child.key}>
                              {child.separatorBefore && <hr className={styles.separator} />}
                              <Link
                                to={child.to}
                                replace={shouldReplaceMobileBackPage(location.pathname, child.to)}
                                className={className}
                                aria-current={childActive ? 'page' : undefined}
                                data-testid="mobile-nav-item"
                                data-nav-key={child.key}
                                onClick={onNavigate}
                              >
                                {child.label}
                              </Link>
                            </Fragment>
                          ) : (
                            <Fragment key={child.key}>
                              {child.separatorBefore && <hr className={styles.separator} />}
                              <button
                                type="button"
                                className={className}
                                data-testid="mobile-nav-item"
                                data-nav-key={child.key}
                                onClick={() => {
                                  child.onClick?.();
                                  onNavigate();
                                }}
                              >
                                {child.label}
                              </button>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }
              const active = isNavItemActive(item, location.pathname);
              const className = [
                styles.link,
                active && styles.linkActive,
                item.key === 'cart' && cartCount > 0 && styles.linkCartAccent,
                item.key === 'login' && styles.linkLogin,
                item.danger && styles.linkDanger,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <Fragment key={item.key}>
                  {item.to ? (
                    <Link
                      to={item.to}
                      replace={shouldReplaceMobileBackPage(location.pathname, item.to)}
                      className={className}
                      aria-current={active ? 'page' : undefined}
                      data-testid="mobile-nav-item"
                      data-nav-key={item.key}
                      onClick={(event) => {
                        navLinkClickHandler(item.onClick)?.(event);
                        onNavigate();
                      }}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={className}
                      aria-current={active ? 'page' : undefined}
                      data-testid="mobile-nav-item"
                      data-nav-key={item.key}
                      onClick={() => {
                        item.onClick?.();
                        onNavigate();
                      }}
                    >
                      {item.label}
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
          {scrollHint.up && (
            <span className={styles.scrollHintUp} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 7.5L6 4L9.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {scrollHint.down && (
            <span className={styles.scrollHintDown} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {(scrollHint.up || scrollHint.down) && (
            <span
              className={[
                styles.scrollHintBar,
                scrollHint.up && styles.scrollHintBarFromUp,
                scrollHint.down && styles.scrollHintBarToDown,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
          )}
        </div>
      </nav>
      {confirmLogout && (
        <ConfirmModal
          variant="dialog"
          title={t.nav.logoutConfirmTitle}
          message={t.nav.logoutConfirmMessage}
          confirmLabel={t.nav.logout}
          closeLabel={t.auth.closeAria}
          onConfirm={() => void handleConfirmLogout()}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
      {loggingOut && <LoadingModal message={t.nav.loggingOutLoading} />}
    </>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
