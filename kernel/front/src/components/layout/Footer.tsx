import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath, stripLangPrefix } from '../../config/i18nRoutes';
import { CORE_FRONT_SLOTS, PluginSlot } from '../../plugins/PluginHost';
import { useNavItems } from '../../hooks/useNavItems';
import { useAccountEntry } from '../../hooks/useAccountEntry';
import { groupProductNav, isNavItemActive, navLinkClickHandler } from './navItems';
import { LoadingModal } from '../ui/LoadingModal';
import { shouldReplaceMobileBackPage } from '../../utils/mobileBackNavigation';
import { ContrastControl } from '../ui/ContrastControl';
import styles from './Footer.module.css';

// Off the entry chunk: the marks need the payment-methods request and the
// brand assets, and the footer is below the fold on every page.
const AcceptedPaymentMarks = lazy(() =>
  import('../checkout/AcceptedPaymentMarks').then((m) => ({ default: m.AcceptedPaymentMarks })),
);

let footerMeasureCanvas: HTMLCanvasElement | null = null;

function footerTextWidth(text: string, weight: string, sizePx: number, family: string): number {
  if (!text) return 0;
  footerMeasureCanvas ??= document.createElement('canvas');
  const ctx = footerMeasureCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = `${weight} ${sizePx}px ${family}`;
  return ctx.measureText(text).width;
}

function LegalIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className={styles.legalIcon}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Footer() {
  const { t, lang } = useLang();
  const { items } = useNavItems();
  const { status, awaitingAuth, openAccountEntry } = useAccountEntry();
  const location = useLocation();
  const topRowRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const [productsGrouped, setProductsGrouped] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const { rest: currentPath } = stripLangPrefix(location.pathname);
  const accountActive =
    currentPath === '/account' ||
    currentPath.startsWith('/account/') ||
    currentPath === '/orders' ||
    currentPath.startsWith('/orders/');
  const accountLabel = status === 'authenticated' ? t.nav.myAccount : t.auth.submitLogin;
  const accountLabelRef = useRef(accountLabel);
  accountLabelRef.current = accountLabel;
  const accountActiveRef = useRef(accountActive);
  accountActiveRef.current = accountActive;
  // One line while Collection and Gallery fit beside the other entries.
  // They fold under Produits only when that full row would wrap.
  const menuItems = productsGrouped ? groupProductNav(items, t.nav.products) : items;
  const menuKey = `${items.map((item) => item.key + item.label).join('\n')}\n${accountLabel}\n${location.pathname}`;

  useLayoutEffect(() => {
    const topRow = topRowRef.current;
    const navList = navListRef.current;
    if (!topRow || !navList) return;

    const apply = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setProductsGrouped((current) => (current ? false : current));
        return;
      }
      const sample = navList.querySelector('a, button, summary');
      if (!(sample instanceof HTMLElement)) return;
      const sampleCs = getComputedStyle(sample);
      const size = parseFloat(sampleCs.fontSize) || 0;
      const family = sampleCs.fontFamily || 'sans-serif';
      if (size <= 0) return;

      const listGap = parseFloat(getComputedStyle(navList).columnGap) || 0;
      const summary = navList.querySelector('summary');
      const summaryCs = summary instanceof HTMLElement ? getComputedStyle(summary) : null;
      const caretGap = summaryCs ? parseFloat(summaryCs.columnGap) || parseFloat(summaryCs.gap) || 0 : 6;
      const caretSize = size * 0.75;

      const source = itemsRef.current;
      const canGroup = false;
      let width = 0;
      let count = 0;
      for (const item of source) {
        const active = isNavItemActive(item, pathRef.current);
        const weight = item.children || active ? '600' : '400';
        width += footerTextWidth(item.label, weight, size, family);
        if (item.children) {
          width += footerTextWidth('⌄', weight, caretSize, family) + caretGap;
        }
        count += 1;
      }
      const accountWeight = accountActiveRef.current ? '600' : '400';
      width += footerTextWidth(accountLabelRef.current, accountWeight, size, family);
      count += 1;
      width += listGap * Math.max(0, count - 1);

      // The menu has the top row to itself.
      const available = topRow.clientWidth;
      const grouped = canGroup && available > 0 && width > available + 0.5;
      setProductsGrouped((current) => (current === grouped ? current : grouped));
    };

    let cancelled = false;
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(topRow);
    window.addEventListener('resize', apply);
    void document.fonts?.ready.then(() => {
      if (!cancelled) apply();
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [menuKey]);

  return (
    // id + tabIndex: target of Layout's "skip to footer" link.
    <footer id="footer" tabIndex={-1} role="contentinfo" className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <PluginSlot name={CORE_FRONT_SLOTS.footerIdentity} />
        </div>

        {/* Right column: the menu alone on top, level with the brand, a rule,
            then the legal links over the accessibility statement, with the
            contrast control to their right. */}
        <div className={styles.mainColumn}>
          <div className={styles.topRow} ref={topRowRef}>
            <nav aria-label={t.footer.navAria} className={styles.nav}>
              <ul className={styles.navList} ref={navListRef}>
                {menuItems.map((item) => {
                  // A sitemap lists every page. Groups (Guide → Tailles/Pose) keep
                  // their heading here too, as a nested list — same grouping as the header
                  // dropdown, so the two navigations stay consistent (RGAA: cohérence de
                  // la navigation). Collapsed by default via <details>, same disclosure
                  // idea as the header's dropdown, without the JS hover/outside-click logic.
                  if (item.children) {
                    const groupActive = isNavItemActive(item, location.pathname);
                    const groupLabelClass = groupActive
                      ? `${styles.navGroupLabel} ${styles.navGroupLabelActive}`
                      : styles.navGroupLabel;
                    return (
                      <li key={item.key} className={styles.navGroup}>
                        <details className={styles.navGroupDetails}>
                          <summary className={groupLabelClass}>{item.label}</summary>
                          <ul className={styles.navGroupList}>
                            {item.children.map((child) => {
                              const childActive = isNavItemActive(child, location.pathname);
                              const childClass = childActive
                                ? `${styles.navLink} ${styles.navLinkActive}`
                                : styles.navLink;
                              return (
                                <li key={child.key}>
                                  {child.to ? (
                                    <Link
                                      to={child.to}
                                      replace={shouldReplaceMobileBackPage(location.pathname, child.to)}
                                      className={childClass}
                                      aria-current={childActive ? 'page' : undefined}
                                    >
                                      {child.label}
                                    </Link>
                                  ) : (
                                    <button type="button" className={childClass} onClick={child.onClick}>
                                      {child.label}
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      </li>
                    );
                  }
                  const active = isNavItemActive(item, location.pathname);
                  const className = active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;
                  return (
                    <li key={item.key}>
                      {item.to ? (
                        <Link
                          to={item.to}
                          replace={shouldReplaceMobileBackPage(location.pathname, item.to)}
                          className={className}
                          aria-current={active ? 'page' : undefined}
                          onClick={navLinkClickHandler(item.onClick)}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <button type="button" className={className} onClick={item.onClick}>
                          {item.label}
                        </button>
                      )}
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    className={accountActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                    aria-current={accountActive ? 'page' : undefined}
                    onClick={openAccountEntry}
                  >
                    {accountLabel}
                  </button>
                </li>
              </ul>
            </nav>
          </div>

          <div className={styles.bottomRow}>
            <div className={styles.bottomText}>
              <nav aria-label={t.footer.legalNavAria} className={styles.legalNav}>
                <Link
                  to={localizedPath('/legal', lang)}
                  className={styles.legalLink}
                  aria-label={t.footer.legalLink}
                >
                  <span className={styles.legalLinkText} aria-hidden="true">
                    {t.footer.legalLink}
                  </span>
                  {/* Mentions légales — building */}
                  <LegalIcon>
                    <path
                      d="M3 15.5V6.2L9 2.5l6 3.7v9.3"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7 15.5V10h4v5.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </LegalIcon>
                </Link>
                <Link
                  to={localizedPath('/privacy', lang)}
                  className={styles.legalLink}
                  aria-label={t.footer.privacyLink}
                >
                  <span className={styles.legalLinkText} aria-hidden="true">
                    {t.footer.privacyLink}
                  </span>
                  {/* Confidentialité — shield */}
                  <LegalIcon>
                    <path
                      d="M9 2.5 3.5 4.8v4.2c0 3.4 2.3 5.6 5.5 6.5 3.2-.9 5.5-3.1 5.5-6.5V4.8L9 2.5Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </LegalIcon>
                </Link>
                <Link
                  to={localizedPath('/terms', lang)}
                  className={styles.legalLink}
                  aria-label={t.footer.termsLink}
                >
                  <span className={styles.legalLinkText} aria-hidden="true">
                    {t.footer.termsLink}
                  </span>
                  {/* CGU — document / list */}
                  <LegalIcon>
                    <path
                      d="M5 2.5h5.2L13.5 6v9.5H5V2.5Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.2 2.5V6h3.3"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M7 9h4M7 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </LegalIcon>
                </Link>
                <Link
                  to={localizedPath('/sales-terms', lang)}
                  className={styles.legalLink}
                  aria-label={t.footer.salesTermsLink}
                >
                  <span className={styles.legalLinkText} aria-hidden="true">
                    {t.footer.salesTermsLink}
                  </span>
                  {/* CGV — receipt / document-check */}
                  <LegalIcon>
                    <path
                      d="M5 2.5h8v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1V2.5Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7 8.2 8.3 9.5 11 6.8"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </LegalIcon>
                </Link>
                <Link
                  to={localizedPath('/sitemap', lang)}
                  className={styles.legalLink}
                  aria-label={t.footer.sitemapLink}
                >
                  <span className={styles.legalLinkText} aria-hidden="true">
                    {t.footer.sitemapLink}
                  </span>
                  {/* Plan du site — sitemap grid */}
                  <LegalIcon>
                    <rect
                      x="6.5"
                      y="2.5"
                      width="5"
                      height="4"
                      rx="0.8"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <rect
                      x="2.5"
                      y="11.5"
                      width="4"
                      height="4"
                      rx="0.8"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <rect
                      x="11.5"
                      y="11.5"
                      width="4"
                      height="4"
                      rx="0.8"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M9 6.5v2.5M4.5 11.5V10h9v1.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </LegalIcon>
                </Link>
              </nav>

              {/* RGAA: the conformance mention, visible on every page (the home
                page included) and linking to the accessibility statement. */}
              <Link to={localizedPath('/accessibility', lang)} className={styles.accessibilityLink}>
                {t.footer.accessibilityLink}
              </Link>
            </div>

            <div className={styles.accessibilityControl}>
              <ContrastControl compactOnMobile />
            </div>
          </div>
        </div>

        {/* Own row under both columns: the brand column's vertical rule stops
            above it, and the marks get the full width to stay on one line. */}
        <Suspense fallback={null}>
          <AcceptedPaymentMarks label={t.footer.acceptedPayments} className={styles.paymentMarks} />
        </Suspense>
      </div>
      {awaitingAuth && <LoadingModal message={t.nav.loadingAccount} />}
    </footer>
  );
}
