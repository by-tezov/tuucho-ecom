import { lazy, Suspense } from 'react';
import { useLang } from '../../assets/i18n';
import { useSectionNav } from '../../hooks/useSectionNav';
import { Button } from '../ui/Button';
import { Figure } from '../ui/Figure';
import { images } from '../../assets/images/manifest';
import { localizedPath } from '../../config/i18nRoutes';
import styles from './Hero.module.css';

const HeroRating = lazy(() => import('./HeroRating'));

export function Hero() {
  const { t, lang } = useLang();
  const sectionNav = useSectionNav();

  return (
    <section id="accueil" aria-labelledby="hero-h" className={styles.section}>
      <div aria-hidden="true" className={styles.texture} />
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t.hero.eyebrow}</p>
          <h1 id="hero-h" className={styles.title}>
            {t.hero.title}
          </h1>
          <div aria-hidden="true" className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerStar}>✦</span>
            <span className={styles.dividerLineEnd} />
          </div>
          <p className={styles.sub}>{t.hero.sub}</p>
          <div className={styles.ctaRow}>
            <Button variant="primary" to={localizedPath('/gallery', lang)}>
              {t.hero.ctaGallery}
            </Button>
            <Button variant="ghost" onClick={() => sectionNav('commander')}>
              {t.hero.ctaOrder}
            </Button>
          </div>
          <div className={styles.stats}>
            <div>
              <div className={styles.statValue}>100%</div>
              <div className={styles.statLabel}>{t.hero.stat1}</div>
            </div>
            <div className={styles.statDivider} />
            <div>
              <div className={styles.statValue}>48h</div>
              <div className={styles.statLabel}>{t.hero.stat2}</div>
            </div>
            <Suspense fallback={null}>
              <HeroRating />
            </Suspense>
          </div>
        </div>
        <Figure
          src={images.hero}
          alt={t.hero.imgAlt}
          aspectRatio="4 / 5"
          className={styles.imageWrap}
          loading="eager"
          fetchPriority="high"
        />
      </div>
    </section>
  );
}
