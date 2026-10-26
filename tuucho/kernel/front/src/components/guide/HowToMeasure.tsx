import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { images } from '../../assets/images/manifest';
import { resolveBrandAsset, useBrandAssets } from '../../plugins/BrandAssetsContext';
import styles from './HowToMeasure.module.css';

const STEP_KEYS = ['guideMeasureStep1', 'guideMeasureStep2', 'guideMeasureStep3'] as const;

export function HowToMeasure() {
  const { t } = useLang();
  const brandAssets = useBrandAssets();

  return (
    <section aria-labelledby="how-h" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <h2 id="how-h" className={styles.title}>
            {t.guide.howTitle}
          </h2>
          <p className={styles.sub}>{t.guide.howSub}</p>
        </div>
        <ol className={styles.list}>
          {t.guide.steps.map((step, i) => (
            <li key={step.n} className={styles.step}>
              <Figure
                src={resolveBrandAsset(
                  brandAssets,
                  STEP_KEYS[i] ?? 'guideMeasureStep1',
                  images.guide.measureSteps[i] ?? '',
                )}
                alt={`${t.guide.howTitle}, ${step.title}`}
                aspectRatio="4 / 3"
                className={styles.imageWrap}
              />
              <div aria-hidden="true" className={styles.num}>
                {step.n}
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
