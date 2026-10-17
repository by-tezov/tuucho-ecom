import { useLang } from '../../assets/i18n';
import { sizeSets } from '../../data/sizeSets';
import { TripleSparkles } from '../ui/TripleSparkles';
import { SizeSetCard } from './SizeSetCard';
import styles from './StandardSizes.module.css';

export function StandardSizes() {
  const { t } = useLang();

  return (
    <section aria-labelledby="std-h" className={styles.section}>
      <TripleSparkles />
      <div className={styles.heading}>
        <h2 id="std-h" className={styles.leadTitle}>
          {t.guide.leadTitle}
        </h2>
        <p className={styles.leadSub}>{t.guide.leadSub}</p>
      </div>
      <ul className={styles.grid}>
        {sizeSets.map((set) => (
          <SizeSetCard key={set.key} set={set} widthLabel={t.guide.chartMm} />
        ))}
      </ul>
      <div className={styles.callout}>
        <div aria-hidden="true" className={styles.calloutIcon}>
          ✦
        </div>
        <div className={styles.calloutBody}>
          <h3 className={styles.calloutTitle}>{t.guide.customTitle}</h3>
          <p className={styles.calloutText}>{t.guide.customSub}</p>
        </div>
      </div>
    </section>
  );
}
