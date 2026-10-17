import { useLang } from '../../assets/i18n';
import { Figure } from '../ui/Figure';
import { images } from '../../assets/images/manifest';
import styles from './HowToMeasure.module.css';

export function HowToMeasure() {
  const { t } = useLang();

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
                src={images.guide.measureSteps[i] ?? ''}
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
