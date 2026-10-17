import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { TripleSparkles } from '../ui/TripleSparkles';
import { images } from '../../assets/images/manifest';
import styles from './About.module.css';

interface AboutProps {
  showTitleOrnament?: boolean;
}

export function About({ showTitleOrnament = false }: AboutProps) {
  const { t } = useLang();

  return (
    <section
      id="apropos"
      aria-labelledby="about-h"
      className={`${styles.section} ${showTitleOrnament ? styles.withTitleOrnament : ''}`}
    >
      {showTitleOrnament && <TripleSparkles />}
      <div className={styles.content}>
        <Figure src={images.aboutPortrait} alt={t.about.imgAlt} aspectRatio="4 / 5" />
        <div>
          <p className={styles.eyebrow}>{t.about.eyebrow}</p>
          <h2 id="about-h" className={styles.title}>
            {t.about.title}
          </h2>
          <p className={styles.p1}>{t.about.p1}</p>
          <p className={styles.p2}>{t.about.p2}</p>
          <p className={styles.p3}>{t.about.p3}</p>
        </div>
      </div>
    </section>
  );
}
