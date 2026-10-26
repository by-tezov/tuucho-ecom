import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { images } from '../../assets/images/manifest';
import { resolveBrandAsset, useBrandAssets } from '../../plugins/BrandAssetsContext';
import styles from './PosePrep.module.css';

// Positional, same order as images.pose.prep: prep-4 exists twice ("avec
// colle" / "avec patch"), hence the two distinct keys.
const PREP_KEYS = [
  'posePrep1',
  'posePrep2',
  'posePrep3',
  'posePrep4Glue',
  'posePrep4Patch',
  'posePrep5',
] as const;

export function PosePrep() {
  const { t } = useLang();
  const brandAssets = useBrandAssets();

  return (
    <section aria-labelledby="prep-h" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <h2 id="prep-h" className={styles.title}>
            {t.pose.prepTitle}
          </h2>
          <p className={styles.sub}>{t.pose.prepSub}</p>
        </div>
        <ol className={styles.list}>
          {t.pose.steps.map((step, i) => (
            // Index, not step.n — "avec colle"/"avec patch" are two distinct
            // steps that intentionally share the same displayed number "4".
            <li key={i} className={styles.step}>
              <Figure
                src={resolveBrandAsset(brandAssets, PREP_KEYS[i] ?? 'posePrep1', images.pose.prep[i] ?? '')}
                alt={`${t.pose.prepTitle}, ${step.title}`}
                aspectRatio="4 / 3"
                className={styles.imageWrap}
              />
              <h3 className={styles.badge}>
                {step.n} - {step.title}
              </h3>
              <p className={styles.stepDesc}>{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
