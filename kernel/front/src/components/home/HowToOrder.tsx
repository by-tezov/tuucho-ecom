import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { SectionHeading } from '../ui/SectionHeading';
import { ShopPlatforms, getActivePlatformKeys } from './ShopPlatforms';
import styles from './HowToOrder.module.css';
import { shouldReplaceMobileBackPage } from '../../utils/mobileBackNavigation';
import { localizedPath } from '../../config/i18nRoutes';

export function HowToOrder() {
  const { t, lang } = useLang();
  const location = useLocation();
  const galleryPath = localizedPath('/gallery', lang);
  const sizesPath = localizedPath('/sizes', lang);
  const activeShopCount = getActivePlatformKeys('shop').length;
  const activeSocialCount = getActivePlatformKeys('social').length;
  const shopTitle = activeShopCount === 1 ? t.order.shopTitleSingular : t.order.shopTitle;

  return (
    <section id="commander" aria-labelledby="order-h" className={styles.section}>
      <SectionHeading
        eyebrow={t.order.eyebrow}
        title={t.order.title}
        sub={t.order.sub}
        headingId="order-h"
        className={styles.heading}
      />
      <ol className={styles.steps}>
        {t.order.steps.map((step, i) => (
          <li key={step.n} className={styles.step}>
            <span aria-hidden="true" className={styles.stepNum}>
              {step.n}
            </span>
            <div className={styles.stepBody}>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.desc}</p>
              {i === 0 && (
                <Link to={galleryPath} className={styles.guideLink}>
                  {t.nav.gallery} <span aria-hidden="true">→</span>
                </Link>
              )}
              {i === 1 && (
                <Link
                  to={sizesPath}
                  replace={shouldReplaceMobileBackPage(location.pathname, sizesPath)}
                  className={styles.guideLink}
                >
                  {t.guide.title} <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      {(activeSocialCount > 0 || activeShopCount > 0) && (
        <div className={styles.platformCards}>
          {activeSocialCount > 0 && (
            <div className={`${styles.shopCard} ${styles.socialCard}`}>
              <h3 className={styles.shopTitle}>{t.order.socialTitle}</h3>
              <p className={styles.shopSub}>{t.order.socialSub}</p>
              <ShopPlatforms group="social" />
            </div>
          )}
          {activeShopCount > 0 && (
            <div className={styles.shopCard}>
              <h3 className={styles.shopTitle}>{shopTitle}</h3>
              <p className={styles.shopSub}>{t.order.shopSub}</p>
              <ShopPlatforms group="shop" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
