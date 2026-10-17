import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { useNavItems } from '../../hooks/useNavItems';
import { useSplashEntryActive } from '../../state/splashEntryGate';
import { groupProductNav, isNavItemActive, navLinkClickHandler } from './navItems';
import { NavDropdown } from './NavDropdown';
import { LangSwitcher } from './LangSwitcher';
import { MobileNav } from './MobileNav';
import { AccountControl } from './AccountControl';
import { CartControl } from './CartControl';
import { ContrastControl } from '../ui/ContrastControl';
import { ThemeSwitch } from '../ui/ThemeSwitch';
import { useGiftLock } from '../../hooks/useGiftLock';
import { useFitGroupFont } from '../../hooks/useFitOneLineTitle';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { shopConfig } from '../../config/env';
import { useStorefrontBootstrap } from '../../plugins/StorefrontBootstrap';
import styles from './Header.module.css';

function AdminIcon() {
  return (
    <svg
      className={styles.adminIcon}
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3.25" y="2.25" width="9.5" height="11.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.6 6.1h4.8M5.6 8.35h4.8M5.6 10.6h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Header() {
  const { t } = useLang();
  const location = useLocation();
  const { store } = useStorefrontBootstrap();
  const brandName = store.name || shopConfig.brandName;
  const brandSuffix = store.suffix || shopConfig.brandSuffix;
  const { items, goHome } = useNavItems({ includeAdmin: true });
  const { shopLocked, originBlocked } = useGiftLock();
  const splashBlocking = useSplashEntryActive();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const adminSlotRef = useRef<HTMLDivElement | null>(null);
  const adminProbeRef = useRef<HTMLSpanElement | null>(null);
  const [adminAsText, setAdminAsText] = useState(false);
  const [productsCollapsed, setProductsCollapsed] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (splashBlocking) setMobileOpen(false);
  }, [splashBlocking]);

  // The open mobile menu dims the page under the header (MobileNav.module.css):
  // Tab stays on the header and the panel, never the hidden page behind. The
  // toggle is inside, so opening leaves focus on it. Closing on a link is a
  // route change, which owns focus, so the trap does not restore it.
  const headerRef = useRef<HTMLElement | null>(null);
  useFocusTrap(headerRef, {
    enabled: mobileOpen,
    restoreFocus: false,
    onEscape: () => {
      setMobileOpen(false);
      mobileToggleRef.current?.focus();
    },
  });

  const homeItem = items.find((item) => item.key === 'home');
  const offerItem = items.find((item) => item.key === 'offer');
  const offerActive = offerItem != null && isNavItemActive(offerItem, location.pathname);
  const adminItem = items.find((item) => item.key === 'admin');
  const adminActive = adminItem != null && isNavItemActive(adminItem, location.pathname);

  const desktopNavItems = items.filter((item) => item.key !== 'admin');
  const canGroupProducts = false;
  const desktopMenuItems =
    productsCollapsed && canGroupProducts
      ? groupProductNav(desktopNavItems, t.nav.products)
      : desktopNavItems;
  const menuLabels = desktopNavItems.map((item) => item.label).join('\n');
  // Padding eases from 12px to one space glyph as the menu slot narrows.
  // The type stays at 18px until that floor, then drops no lower than 16px.
  // Below that, Collection folds into Produits.
  useFitGroupFont(menuRef, menuLabels, {
    mediaQuery: '(min-width: 1024px)',
    minFont: 16,
    maxFont: 18,
    minPad: 2,
    maxPad: 12,
    tightProbe: {
      enabled: canGroupProducts,
      entries: desktopNavItems.map((item) => ({
        text: item.label,
        dropdown: item.children != null,
        bordered: item.key === 'offer',
        weight: isNavItemActive(item, location.pathname) ? '700' : item.key === 'offer' ? '600' : '500',
      })),
      onTight: (tight) => {
        setProductsCollapsed((current) => {
          const next = canGroupProducts && tight;
          return current === next ? current : next;
        });
      },
    },
  });

  useLayoutEffect(() => {
    const slot = adminSlotRef.current;
    const probe = adminProbeRef.current;
    if (!slot || !probe) return;
    const apply = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setAdminAsText(false);
        return;
      }
      const cs = getComputedStyle(slot);
      const available =
        slot.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      setAdminAsText(probe.offsetWidth <= available + 0.5);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(slot);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [adminItem?.label]);

  const offerClass = offerActive
    ? `${styles.navButton} ${styles.navButtonOffer} ${styles.navButtonActive}`
    : `${styles.navButton} ${styles.navButtonOffer}`;

  const targetClass =
    __APP_TARGET__ === 'dev' ? styles.headerDev : __APP_TARGET__ === 'preprod' ? styles.headerPreprod : '';
  const inertClass = splashBlocking ? styles.headerInert : '';

  return (
    <header
      ref={headerRef}
      className={`${styles.header} ${targetClass} ${inertClass}`.trim()}
      // While the `/` entry splash owns the page body, chrome stays visible
      // but must not navigate away mid-intro (HTML inert disables focus + clicks).
      {...(splashBlocking ? { inert: true } : {})}
      aria-busy={splashBlocking || undefined}
    >
      {adminItem?.to ? (
        <div className={styles.adminSlot} ref={adminSlotRef}>
          <span className={styles.adminProbe} ref={adminProbeRef} aria-hidden="true">
            {adminItem.label}
          </span>
          <Link
            to={adminItem.to}
            className={[
              styles.adminControl,
              adminAsText ? styles.adminAsText : '',
              adminActive ? styles.adminControlActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={adminActive ? 'page' : undefined}
            aria-label={adminItem.label}
          >
            <AdminIcon />
            <span className={styles.adminLabel}>{adminItem.label}</span>
          </Link>
        </div>
      ) : null}
      <div className={styles.inner}>
        <div className={styles.brandGroup}>
          <LangSwitcher {...(styles.langControl ? { className: styles.langControl } : {})} />
          <Link
            to={homeItem?.to ?? '/'}
            className={styles.brand}
            aria-label={t.brandAria}
            onClick={navLinkClickHandler(goHome)}
          >
            <span className={styles.brandName}>{brandName}</span>
            <span className={styles.brandSuffix}>{brandSuffix}</span>
          </Link>
        </div>

        <div className={styles.desktopMenu} ref={menuRef}>
          <nav aria-label={t.navAria} className={styles.desktopNav}>
            {desktopMenuItems.map((item, index) => {
              const active = isNavItemActive(item, location.pathname);
              const className =
                item.key === 'offer'
                  ? active
                    ? `${styles.navButton} ${styles.navButtonOffer} ${styles.navButtonActive}`
                    : `${styles.navButton} ${styles.navButtonOffer}`
                  : active
                    ? `${styles.navButton} ${styles.navButtonActive}`
                    : styles.navButton;
              const entry = item.children ? (
                <NavDropdown item={item} />
              ) : item.to ? (
                <Link
                  to={item.to}
                  className={className}
                  data-nav-fit=""
                  aria-current={active ? 'page' : undefined}
                  onClick={navLinkClickHandler(item.onClick)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className={className}
                  data-nav-fit=""
                  aria-current={active ? 'page' : undefined}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              );
              return (
                <Fragment key={item.key}>
                  {index > 0 ? <span className={styles.navDot} data-nav-dot="" aria-hidden="true" /> : null}
                  {entry}
                </Fragment>
              );
            })}
          </nav>
          {!shopLocked && !originBlocked && (
            <>
              <span className={styles.navDot} data-nav-dot="" aria-hidden="true" />
              <AccountControl {...(styles.accountControl ? { className: styles.accountControl } : {})} />
            </>
          )}
        </div>

        <div className={styles.trailingControls}>
          <div className={styles.appearanceControls}>
            <ThemeSwitch
              {...(styles.themeControl ? { className: styles.themeControl } : {})}
              modes="light-dark"
            />
            <ContrastControl
              {...(styles.contrastControl ? { className: styles.contrastControl } : {})}
              modes="standard-more"
            />
          </div>
          {!originBlocked && (
            <CartControl {...(styles.cartControl ? { className: styles.cartControl } : {})} />
          )}
          {offerItem?.to ? (
            <Link
              to={offerItem.to}
              className={`${offerClass} ${styles.offerControl}`}
              aria-current={offerActive ? 'page' : undefined}
            >
              {offerItem.label}
            </Link>
          ) : null}
          <button
            ref={mobileToggleRef}
            type="button"
            className={`${styles.mobileToggle} ${mobileOpen ? styles.mobileToggleOpen : ''}`.trim()}
            data-testid="mobile-nav-toggle"
            aria-label={mobileOpen ? t.menuCloseAria : t.menuOpenAria}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span className={styles.mobileToggleBar} />
            <span className={styles.mobileToggleBar} />
            <span className={styles.mobileToggleBar} />
          </button>
        </div>

        <MobileNav
          id="mobile-nav-panel"
          open={mobileOpen}
          // Gallery, Composition and Cart also live in the mobile bottom tab
          // bar (MobileTabBar.tsx). This panel keeps Composition directly
          // under Collection, then Panier (MobileNav.tsx). Administration
          // is never a menu entry: it stays on the left of the language
          // switch (.adminSlot). Offrir sits in the header before the
          // burger, not in this panel.
          items={items.filter((item) => item.key !== 'offer' && item.key !== 'admin')}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
    </header>
  );
}
