import { useEffect, useState, type MouseEvent } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { adminPath } from '../utils/adminRoute';
import { useAdminAttentionCounts } from '../hooks/useAdminAttentionCounts';
import { adminNavGroups, buildAdminSections, canOpenSection, type AdminNavItem } from './adminNav';
import { getAdminAccess, type AdminAccess } from '../api/admin/roles';
import { AdminAccessProvider, canAccess, useAdminAccess } from '../state/AdminAccessContext';
import { useAuthSession } from '../state/AuthContext';
import { AdminStringsProvider, useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { LoadingModal } from '../components/ui/LoadingModal';
import { OrdersTileIcon, ProductRequestsTileIcon, ChatsTileIcon } from './AdminPageIcons';
import { AdminChromeProvider, useAdminChromeResetSectionRef } from '../state/AdminChromeContext';
import { ToastProvider } from '../state/ToastContext';
import { BottomSheet } from '../components/ui/BottomSheet';
import { LangSwitcher } from '../components/layout/LangSwitcher';
import { ThemeSwitch } from '../components/ui/ThemeSwitch';
import { ContrastControl } from '../components/ui/ContrastControl';
import { shopConfig } from '../config/env';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import styles from './AdminLayout.module.css';

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

function ExitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.5 2.5H3.7c-.7 0-1.2.5-1.2 1.2v8.6c0 .7.5 1.2 1.2 1.2h2.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 5 13 8l-3.2 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 8H6.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={styles.badge} aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function groupItems(items: AdminNavItem[], a: AdminUiStrings) {
  return adminNavGroups(a)
    .map((group) => ({
      group,
      groupItems: items.filter((item) => item.group === group.id),
    }))
    .filter((entry) => entry.groupItems.length > 0);
}

/** Master-detail sections: a repeat tap on their nav entry brings the page
 * back to its list (see AdminChromeContext). */
const RESETTABLE_SECTION_IDS = new Set(['orders', 'product-requests', 'contact', 'api-log', 'email-log']);

/** Sections already reachable from the bottom nav: repeating them in the
 * "Plus" sheet would just be noise. */
const BOTTOM_NAV_SECTION_IDS = new Set(['orders', 'product-requests', 'contact']);

export function AdminLayout() {
  return (
    <AdminStringsProvider fallback={<AdminStringsLoading />}>
      <AdminChromeProvider>
        <ToastProvider>
          <AdminAccessGate />
        </ToastProvider>
      </AdminChromeProvider>
    </AdminStringsProvider>
  );
}

/** Loads what the signed-in role may open before any section renders, so
 * the navigation never shows (or requests) a section it would be refused. */
function AdminAccessGate() {
  const { t } = useLang();
  const { authedRequest } = useAuthSession();
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedRequest((token) => getAdminAccess(token))
      .then((result) => {
        if (!cancelled) setAccess(result.access);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authedRequest]);

  if (failed) {
    return (
      <p className={styles.accessError} role="alert">
        {t.admin.actionError}
      </p>
    );
  }
  if (!access) return <LoadingModal message={t.admin.contentLoading} />;
  return (
    <AdminAccessProvider access={access}>
      <AdminLayoutInner />
    </AdminAccessProvider>
  );
}

/** Shown while the administration copy for the current language loads. */
function AdminStringsLoading() {
  const { t } = useLang();
  return <LoadingModal message={t.admin.contentLoading} />;
}

function AdminLayoutInner() {
  const { t } = useLang();
  const a = useAdminStrings();
  const { store, plugins } = useStorefrontBootstrap();
  const brandName = store.name || shopConfig.brandName;
  const brandSuffix = store.suffix || shopConfig.brandSuffix;
  const location = useLocation();
  const resetSectionRef = useAdminChromeResetSectionRef();
  const access = useAdminAccess();
  const { counts, refresh: refreshAttentionCounts } = useAdminAttentionCounts(access);
  const allSections = buildAdminSections(t, a, counts);
  const sections = allSections.filter((item) => {
    if (!canOpenSection(item, access)) return false;
    if (!item.pluginId) return true;
    const plugin = plugins.find((entry) => entry.id === item.pluginId);
    return !plugin || plugin.enabled;
  });
  const standaloneItems = sections.filter((item) => item.group === 'standalone');
  const groupedSections = sections.filter((item) => item.group !== 'standalone');
  const moreItems = groupedSections.filter((item) => !BOTTOM_NAV_SECTION_IDS.has(item.id));
  const moreStandaloneItems = standaloneItems.filter((item) => !BOTTOM_NAV_SECTION_IDS.has(item.id));
  // Same figure as the sidebar's Orders badge, computed once in adminNav.
  const ordersBadgeCount = sections.find((item) => item.id === 'orders')?.count ?? 0;
  const [moreOpen, setMoreOpen] = useState(false);

  const homePath = adminPath();
  const isHome = location.pathname === homePath;
  const ordersPath = adminPath('/orders');
  const requestsPath = adminPath('/product-requests');
  const chatsPath = adminPath('/chats');
  const contactsPath = adminPath('/unconnected-contacts');
  const messagesCount = (counts.chatsOpen ?? 0) + (counts.contactsNew ?? 0);

  function isActive(to: string) {
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  function isItemActive(item: AdminNavItem) {
    return isActive(item.to) || (item.alsoActiveOn ?? []).some(isActive);
  }

  const isMessagesActive = isActive(chatsPath) || isActive(contactsPath);
  // A section this role does not hold (typed URL, stale link): back to the
  // dashboard rather than a page whose every request would be refused.
  const blockedSection = allSections.some(
    (item) =>
      !canOpenSection(item, access) && (isActive(item.to) || (item.alsoActiveOn ?? []).some(isActive)),
  );
  const isMoreActive = moreOpen || moreItems.some(isItemActive) || moreStandaloneItems.some(isItemActive);

  /** A tap on the entry of the page already shown: no navigation (the route
   * would not remount anyway), back to the page's list and to the top. */
  function onSectionClick(event: MouseEvent, to: string, resettable: boolean) {
    if (!isActive(to)) return;
    event.preventDefault();
    if (resettable) resetSectionRef?.current?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navLinkClass(active: boolean) {
    return active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;
  }

  function tabClass(active: boolean) {
    return active ? `${styles.tab} ${styles.tabActive}` : styles.tab;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label={t.admin.pageTitle}>
        <div className={styles.brand}>
          <div className={styles.brandName}>{brandName}</div>
          <div className={styles.brandKicker}>{t.admin.pageTitle}</div>
        </div>
        <nav className={styles.sidebarNav}>
          {standaloneItems.map((item) => {
            const active = isItemActive(item);
            const target = active && !isActive(item.to) ? location.pathname : item.to;
            return (
              <Link
                key={item.id}
                to={target}
                className={navLinkClass(active)}
                aria-current={active ? 'page' : undefined}
                onClick={(event) => onSectionClick(event, target, RESETTABLE_SECTION_IDS.has(item.id))}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                <Badge count={item.count} />
              </Link>
            );
          })}
          <Link to={homePath} className={navLinkClass(isHome)} aria-current={isHome ? 'page' : undefined}>
            <span className={styles.navIcon}>
              <HomeIcon />
            </span>
            <span className={styles.navLabel}>{t.admin.homeNavLabel}</span>
          </Link>
          {groupItems(groupedSections, a).map((entry) => (
            <div key={entry.group.id} className={styles.navGroup}>
              <div className={styles.navGroupLabel}>{entry.group.label}</div>
              {entry.groupItems.map((item) => {
                const active = isItemActive(item);
                // Contact on its guest tab: a repeat tap stays there.
                const target = active && !isActive(item.to) ? location.pathname : item.to;
                return (
                  <Link
                    key={item.id}
                    to={target}
                    className={navLinkClass(active)}
                    aria-current={active ? 'page' : undefined}
                    onClick={(event) => onSectionClick(event, target, RESETTABLE_SECTION_IDS.has(item.id))}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                    <Badge count={item.count} />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topBar}>
          <div className={styles.topBarInner}>
            <div className={styles.topBrandGroup}>
              <LangSwitcher />
              {/* Same brand mark as the public site's header (Header.tsx),
                  only the destination differs (admin dashboard, not "/"). */}
              <Link to={homePath} className={styles.topBrand} aria-label={t.brandAria}>
                <span className={styles.topBrandName}>{brandName}</span>
                <span className={styles.topBrandSuffix}>{brandSuffix}</span>
              </Link>
            </div>
            <div className={styles.topBarFiller}>
              <ThemeSwitch
                {...(styles.themeControl ? { className: styles.themeControl } : {})}
                modes="light-dark"
              />
              <ContrastControl
                {...(styles.themeControl ? { className: styles.themeControl } : {})}
                modes="standard-more"
              />
            </div>
            {/* Client-side navigation so the intro does not replay. A full
                load of `/` during this browser opening stays on the shop:
                AdminSessionRedirect only steals the first cold restore. */}
            <Link
              to="/"
              className={styles.exitButton}
              aria-label={t.admin.exitAdmin}
              title={t.admin.exitAdmin}
            >
              <ExitIcon />
            </Link>
          </div>
        </header>

        <main id="admin-main" className={styles.content}>
          {blockedSection ? (
            <Navigate to={homePath} replace />
          ) : (
            <Outlet context={{ counts, refreshAttentionCounts }} />
          )}
        </main>
      </div>

      <nav className={styles.bottomNav} aria-label={t.admin.pageTitle}>
        {canAccess(access, 'orders') && (
          <Link
            to={ordersPath}
            className={tabClass(isActive(ordersPath))}
            aria-current={isActive(ordersPath) ? 'page' : undefined}
            onClick={(event) => onSectionClick(event, ordersPath, true)}
          >
            <span className={styles.tabIcon}>
              <OrdersTileIcon />
              <Badge count={ordersBadgeCount} />
            </span>
            <span className={styles.tabLabel}>{t.admin.ordersTitle}</span>
          </Link>
        )}
        {sections.some((item) => item.id === 'product-requests') && (
          <Link
            to={requestsPath}
            className={tabClass(isActive(requestsPath))}
            aria-current={isActive(requestsPath) ? 'page' : undefined}
            onClick={(event) => onSectionClick(event, requestsPath, true)}
          >
            <span className={styles.tabIcon}>
              <ProductRequestsTileIcon />
              <Badge count={counts.productRequestsRequested ?? 0} />
            </span>
            <span className={styles.tabLabel}>{a.nav.requestsTab}</span>
          </Link>
        )}
        {canAccess(access, 'messages') && (
          <Link
            to={isActive(contactsPath) ? contactsPath : chatsPath}
            className={tabClass(isMessagesActive)}
            aria-current={isMessagesActive ? 'page' : undefined}
            onClick={(event) =>
              onSectionClick(event, isActive(contactsPath) ? contactsPath : chatsPath, true)
            }
          >
            <span className={styles.tabIcon}>
              <ChatsTileIcon />
              <Badge count={messagesCount} />
            </span>
            <span className={styles.tabLabel}>{a.nav.contactLabel}</span>
          </Link>
        )}
        <button type="button" className={tabClass(isMoreActive)} onClick={() => setMoreOpen(true)}>
          <span className={styles.tabIcon}>
            <MoreIcon />
          </span>
          <span className={styles.tabLabel}>{t.admin.moreNavLabel}</span>
        </button>
      </nav>

      {moreOpen && (
        <BottomSheet
          title={t.admin.moreNavLabel}
          onClose={() => setMoreOpen(false)}
          closeLabel={t.gallery.close}
        >
          <div className={styles.moreGroups}>
            {moreStandaloneItems.length > 0 && (
              <div className={styles.moreGrid}>
                {moreStandaloneItems.map((item) => (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={
                      isActive(item.to) ? `${styles.moreTile} ${styles.moreTileActive}` : styles.moreTile
                    }
                    aria-current={isActive(item.to) ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                  >
                    <span className={styles.moreIcon}>{item.icon}</span>
                    <span className={styles.moreLabel}>{item.label}</span>
                    <Badge count={item.count} />
                  </Link>
                ))}
              </div>
            )}
            {groupItems(moreItems, a).map((entry) => (
              <section key={entry.group.id} className={styles.moreGroup} aria-label={entry.group.label}>
                <h3 className={styles.moreGroupLabel}>{entry.group.label}</h3>
                <div className={styles.moreGrid}>
                  {entry.groupItems.map((item) => (
                    <Link
                      key={item.id}
                      to={item.to}
                      className={
                        isActive(item.to) ? `${styles.moreTile} ${styles.moreTileActive}` : styles.moreTile
                      }
                      aria-current={isActive(item.to) ? 'page' : undefined}
                      onClick={() => setMoreOpen(false)}
                    >
                      <span className={styles.moreIcon}>{item.icon}</span>
                      <span className={styles.moreLabel}>{item.label}</span>
                      <Badge count={item.count} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
