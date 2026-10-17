import { Link } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Seo } from '../components/seo/Seo';
import { localizedPath } from '../config/i18nRoutes';
import { useNavItems } from '../hooks/useNavItems';
import { useAuthSession } from '../state/AuthContext';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import styles from './LegalPage.module.css';

export function SitemapPage() {
  const { t, lang } = useLang();
  const loyaltyOn = usePluginEnabled('commerce-loyalty');
  const { items } = useNavItems({ includeOfferWhenEnabled: true });
  // Account/orders are behind RequireAuth, which bounces an anonymous visitor
  // to Accueil/gallery with no return path (see RequireAuth's own comment).
  // Listing them here for a signed-out reader would just be a dead end, and
  // the prerendered build (no session) is what crawlers see, so this also
  // keeps private pages out of the indexable sitemap.
  const { status } = useAuthSession();

  return (
    <section aria-labelledby="sitemap-h" className={styles.section}>
      <Seo title={t.seo.sitemapTitle} description={t.seo.sitemapDesc} path="/sitemap" />
      <LegalPageBackLink />
      <p className={styles.eyebrow}>{t.sitemapPage.eyebrow}</p>
      <h1 id="sitemap-h" className={styles.title}>
        {t.sitemapPage.title}
      </h1>
      <p className={styles.intro}>{t.sitemapPage.intro}</p>
      <p className={styles.updated}>
        {t.sitemapPage.version} {__APP_VERSION__}
      </p>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.sitemapPage.pagesTitle}</h2>
        <ul className={styles.sitemapList}>
          {items.map((item) => (
            <li key={item.key}>
              {item.children ? (
                <>
                  {item.label}
                  <ul className={styles.sitemapSubList}>
                    {item.children.map((child) => (
                      <li key={child.key}>
                        <Link to={child.to ?? '#'}>{child.label}</Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : item.to ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <button type="button" onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </li>
          ))}
          {status === 'authenticated' && (
            <li>
              <Link to={localizedPath('/account', lang)}>{t.nav.myAccount}</Link>
              <ul className={styles.sitemapSubList}>
                <li>
                  <Link to={localizedPath('/account', lang)}>{t.nav.account}</Link>
                </li>
                <li>
                  <Link to={localizedPath('/account/addresses', lang)}>{t.nav.addresses}</Link>
                </li>
                <li>
                  <Link to={localizedPath('/account/payment-methods', lang)}>{t.nav.paymentMethods}</Link>
                </li>
                {loyaltyOn ? (
                  <li>
                    <Link to={localizedPath('/account/loyalty', lang)}>{t.nav.loyalty}</Link>
                  </li>
                ) : null}
                <li>
                  <Link to={localizedPath('/orders', lang)}>{t.nav.ordersActive}</Link>
                </li>
                <li>
                  <Link to={localizedPath('/orders/history', lang)}>{t.nav.ordersHistory}</Link>
                </li>
                <li>
                  <Link to={localizedPath('/account/notifications', lang)}>{t.nav.notifications}</Link>
                </li>
              </ul>
            </li>
          )}
        </ul>
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.sitemapPage.legalTitle}</h2>
        <ul className={styles.sitemapList}>
          <li>
            <Link to={localizedPath('/legal', lang)}>{t.footer.legalLink}</Link>
          </li>
          <li>
            <Link to={localizedPath('/privacy', lang)}>{t.footer.privacyLink}</Link>
          </li>
          <li>
            <Link to={localizedPath('/terms', lang)}>{t.footer.termsLink}</Link>
          </li>
          <li>
            <Link to={localizedPath('/sales-terms', lang)}>{t.footer.salesTermsLink}</Link>
          </li>
          <li>
            <Link to={localizedPath('/accessibility', lang)}>{t.accessibilityStatement.title}</Link>
          </li>
        </ul>
      </div>

      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
