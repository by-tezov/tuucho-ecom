import { useLang } from '../../assets/i18n';
import styles from './GuideHero.module.css';

export function GuideHero() {
  const { t } = useLang();

  return (
    <section aria-labelledby="guide-h" className={styles.section}>
      <div aria-hidden="true" className={styles.texture} />
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{t.guide.eyebrow}</p>
        <h1 id="guide-h" className={styles.title}>
          {t.guide.title}
        </h1>
      </div>
    </section>
  );
}
