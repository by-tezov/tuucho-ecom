import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { useLang } from '../../assets/i18n';
import { useAuthCommands, useAuthSession } from '../../state/AuthContext';
import { GALLERY_PATH, HOME_PATH } from '../../config/paths';
import { localizedPath, stripLangPrefix } from '../../config/i18nRoutes';
import { shopConfig } from '../../config/env';
import { isMobileBackViewport } from '../../utils/mobileBackNavigation';
import { withMinDuration } from '../../utils/withMinDuration';
import { adminPath } from '../../utils/adminRoute';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ContentLoading } from '../ui/ContentLoading';
import { LoadingModal } from '../ui/LoadingModal';
import styles from './AccountShell.module.css';
import { usePluginEnabled } from '../../plugins/StorefrontBootstrap';

interface AccountShellProps {
  children?: ReactNode;
  /** Initial route data is collected before the page content mounts. */
  loading?: boolean;
}

// Tab order for the slide-direction logic below — kept separate from the
// display `links` array (which needs `t` for labels) since this only needs
// to be a stable list of paths.
const TAB_ORDER_BASE = [
  '/account',
  '/account/addresses',
  '/account/payment-methods',
  '/account/loyalty',
  '/orders',
  '/orders/history',
  '/account/notifications',
];

// Module-level (not a ref) because each account route mounts its own
// <AccountShell> instance (see App.tsx — one <Route element> per page, no
// shared layout route with an Outlet), so navigating between them fully
// unmounts and remounts AccountShell. A ref would reinitialize on every
// mount and never see the tab just left. This module-level value survives
// the remount for as long as the page stays loaded, which is exactly the
// lifetime that matters here.
let lastTabIndex = -1;

/** Shared account-page frame. Account navigation lives in the sidebar here
 * on desktop, staying visible while the customer manages details — on
 * mobile it's reached from the hamburger menu instead (MobileNav.tsx's
 * "Mon compte" group) and this renders only the content, no sidebar. */
export function AccountShell({ children, loading = false }: AccountShellProps) {
  const loyaltyOn = usePluginEnabled('tuucho-commerce-loyalty');
  const { t, lang } = useLang();
  const { pathname } = useLocation();
  const currentPath = stripLangPrefix(pathname).rest;
  const { isImpersonating } = useAuthSession();
  const { logout, stopImpersonating } = useAuthCommands();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Covers the POST /auth/logout round trip + local session clearing —
  // navigating before it settles left the bottom nav bar briefly still
  // showing the signed-in state on the page it landed on.
  const [loggingOut, setLoggingOut] = useState(false);

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

  const tabOrder = loyaltyOn ? TAB_ORDER_BASE : TAB_ORDER_BASE.filter((path) => path !== '/account/loyalty');

  type NavLink = {
    to: string;
    label: string;
    icon: string;
    active: boolean;
    separatorAfter?: boolean;
  };

  const links: Array<NavLink | { separatorOnly: true }> = [
    {
      to: localizedPath('/account', lang),
      label: t.nav.account,
      icon: '●',
      active: currentPath === '/account',
    },
    {
      to: localizedPath('/account/addresses', lang),
      label: t.nav.addresses,
      icon: '●',
      active: currentPath === '/account/addresses',
    },
    {
      to: localizedPath('/account/payment-methods', lang),
      label: t.nav.paymentMethods,
      icon: '●',
      active: currentPath === '/account/payment-methods',
      separatorAfter: !loyaltyOn,
    },
    ...(loyaltyOn
      ? [
          {
            to: localizedPath('/account/loyalty', lang),
            label: t.nav.loyalty,
            icon: '●',
            active: currentPath === '/account/loyalty',
            separatorAfter: true,
          } satisfies NavLink,
        ]
      : []),
    {
      to: localizedPath('/orders', lang),
      label: t.nav.ordersActive,
      icon: '●',
      active: currentPath === '/orders',
    },
    {
      to: localizedPath('/orders/history', lang),
      label: t.nav.ordersHistory,
      icon: '●',
      active: currentPath === '/orders/history',
      separatorAfter: true,
    },
    {
      to: localizedPath('/account/notifications', lang),
      label: t.nav.notifications,
      icon: '●',
      active: currentPath === '/account/notifications',
      separatorAfter: true,
    },
  ];

  // Which way the content slides in — a tab further along TAB_ORDER than
  // the one just left slides in from the right ("forward"), an earlier one
  // from the left ("backward"), mirroring the clicked tab's position
  // relative to the current one. null when there's no previous tab to
  // compare against (first page load), so that case never animates.
  //
  // Computed once via useRef's lazy initializer, which runs exactly once
  // for this AccountShell instance's whole lifetime (mount to unmount) —
  // not on every render, since a data-fetch setState elsewhere on the page
  // would otherwise re-run this on the SAME pathname and wipe the class
  // mid-animation. Reads the module-level "last tab" pair (see above) at
  // that one moment, so it's correct even though this <div key={pathname}>
  // remounts in the very same render pathname changes in.
  const directionRef = useRef<'forward' | 'backward' | null>(null);
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    initializedRef.current = true;
    const currentTabIndex = tabOrder.indexOf(currentPath);
    directionRef.current =
      lastTabIndex !== -1 && currentTabIndex !== -1 && currentTabIndex !== lastTabIndex
        ? currentTabIndex > lastTabIndex
          ? 'forward'
          : 'backward'
        : null;
    if (currentTabIndex !== -1) lastTabIndex = currentTabIndex;
  }
  const direction = directionRef.current;

  const contentClassName =
    direction === 'forward'
      ? `${styles.content} ${styles.contentForward}`
      : direction === 'backward'
        ? `${styles.content} ${styles.contentBackward}`
        : styles.content;

  return (
    <div className={styles.layout}>
      <div className={styles.sidebarWrap}>
        <aside className={styles.sidebar} aria-label={t.nav.myAccount} data-testid="account-nav">
          <p className={styles.eyebrow}>{t.nav.myAccount}</p>
          <hr className={styles.separator} />
          <nav className={styles.nav}>
            {isImpersonating && (
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  stopImpersonating();
                  navigate(adminPath());
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  ●
                </span>
                {t.admin.stopImpersonating}
              </button>
            )}
            {links.map((link) => {
              if ('separatorOnly' in link) return null;
              return (
                <Fragment key={link.to}>
                  <Link
                    to={link.to}
                    className={link.active ? `${styles.link} ${styles.linkActive}` : styles.link}
                    aria-current={link.active ? 'page' : undefined}
                    data-testid="account-nav-tab"
                    data-route={link.to}
                  >
                    <span className={styles.icon} aria-hidden="true">
                      {link.icon}
                    </span>
                    {link.label}
                  </Link>
                  {link.separatorAfter && <hr className={styles.separator} />}
                </Fragment>
              );
            })}
            <button
              type="button"
              className={`${styles.link} ${styles.logout}`}
              data-testid="account-logout"
              onClick={() => setConfirmLogout(true)}
            >
              <span className={styles.icon} aria-hidden="true">
                ●
              </span>
              {t.nav.logout}
            </button>
          </nav>
        </aside>
      </div>
      <div key={pathname} className={contentClassName}>
        {loading ? <ContentLoading message={t.nav.loadingAccount} /> : children}
      </div>
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
    </div>
  );
}
