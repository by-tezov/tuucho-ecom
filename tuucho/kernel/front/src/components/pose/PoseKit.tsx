import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { TripleSparkles } from '../ui/TripleSparkles';
import { images } from '../../assets/images/manifest';
import { resolveBrandAsset, useBrandAssets } from '../../plugins/BrandAssetsContext';
import styles from './PoseKit.module.css';

export function PoseKit() {
  const { t } = useLang();
  const brandAssets = useBrandAssets();

  return (
    <section aria-labelledby="kit-h" className={styles.section}>
      <div>
        <TripleSparkles />
        <p className={styles.intro}>{t.pose.intro}</p>
        <div className={styles.grid}>
          <Figure
            src={resolveBrandAsset(brandAssets, 'poseKit', images.pose.kit)}
            alt={t.pose.kitAlt}
            aspectRatio="4 / 3"
            fit="contain"
          />
          <div>
            <h2 id="kit-h" className={styles.title}>
              {t.pose.kitTitle}
            </h2>
            <p className={styles.text}>{t.pose.kitText}</p>
            <ul className={styles.includes}>
              {t.pose.kitIncludes.map((item) => (
                <li key={item} className={styles.includeItem}>
                  <span aria-hidden="true" className={styles.mark}>
                    ✦
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
