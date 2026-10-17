import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { Button } from '../ui/Button';
import raw from '../../assets/i18n/data/guide-size-chart.json';
import { sizeSets } from '../../data/sizeSets';
import cardStyles from './SizeSetCard.module.css';
import styles from './SizeTipSets.module.css';

const chart = (raw as unknown as { chart: Record<string, number> }).chart;

/** The chart's tip number for a width in mm, `?` when none matches. */
export function tipForMm(mm: number): string {
  return Object.keys(chart).find((tip) => chart[tip] === mm) ?? '?';
}

/** The standard sizes again, as tip numbers from the size chart (thumb to
 * little finger, comma separated), then the way on to the gallery: both appear
 * together, once this chunk has loaded. Loaded lazily by SizeChartSection: the
 * guide page is prerendered into the entry bundle, which is at its ceiling. */
export default function SizeTipSets() {
  const { t, lang } = useLang();
  return (
    <>
      <ul className={styles.tipSets}>
        {sizeSets.map((set) => (
          <li key={set.key}>
            <div className={cardStyles.card}>
              <div className={cardStyles.header}>
                <div aria-hidden="true" className={cardStyles.headerStar}>
                  ✦
                </div>
                <div className={cardStyles.headerKey}>{set.key}</div>
              </div>
              <p className={styles.tips}>{set.mm.map(tipForMm).join(', ')}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.tipSetsNote}>{t.guide.tipSetsNote}</p>
      <div className={styles.actions}>
        <Button variant="ghost" className={styles.cta} to={localizedPath('/gallery', lang)}>
          {t.guide.ctaOrder}
        </Button>
      </div>
    </>
  );
}
