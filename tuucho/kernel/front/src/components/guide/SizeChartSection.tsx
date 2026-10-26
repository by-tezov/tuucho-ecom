import { lazy, Suspense } from 'react';
import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { images } from '../../assets/images/manifest';
import { resolveBrandAsset, useBrandAssets } from '../../plugins/BrandAssetsContext';
import { sizeChart } from '../../data/sizeChart';
import styles from './SizeChartSection.module.css';

const SizeTipSets = lazy(() => import('./SizeTipSets'));

export function SizeChartSection() {
  const { t } = useLang();
  const brandAssets = useBrandAssets();

  return (
    <section aria-labelledby="chart-h" className={styles.section}>
      <div className={styles.heading}>
        <h2 id="chart-h" className={styles.title}>
          {t.guide.chartTitle}
        </h2>
        <p className={styles.sub}>{t.guide.chartSub}</p>
      </div>
      <div className={styles.grid}>
        <Figure
          src={resolveBrandAsset(brandAssets, 'guideSizeChart', images.guide.sizeChart)}
          alt={t.guide.chartTitle}
          aspectRatio="2 / 3"
          fit="fill"
        />
        {/* Titled by the section heading (RGAA 5.4). */}
        <table className={styles.table} aria-labelledby="chart-h">
          <thead>
            <tr className={styles.theadRow}>
              <th scope="col" className={styles.th}>
                {t.guide.chartNum}
              </th>
              <th scope="col" className={styles.thRight}>
                {t.guide.chartMm}
              </th>
            </tr>
          </thead>
          <tbody>
            {sizeChart.map((row) => (
              <tr key={row.tip} className={styles.row}>
                <th scope="row" className={styles.num}>
                  {row.tip}
                </th>
                <td className={styles.mm}>{row.mm} mm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Suspense fallback={null}>
        <SizeTipSets />
      </Suspense>
    </section>
  );
}
