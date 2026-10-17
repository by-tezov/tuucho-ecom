import { useLang } from '../../assets/i18n';
import styles from './PoseRemoval.module.css';

export function PoseRemoval() {
  const { t } = useLang();

  return (
    <section aria-labelledby="removal-h" className={styles.section}>
      <div className={styles.card}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>✦</p>
          <h2 id="removal-h" className={styles.title}>
            {t.pose.removalTitle}
          </h2>
          <p className={styles.sub}>{t.pose.removalSub}</p>
        </div>
        <ol className={styles.steps}>
          {t.pose.removalSteps.map((step) => (
            <li key={step.n} className={styles.step}>
              <span aria-hidden="true" className={styles.num}>
                {step.n}
              </span>
              <div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.note}>{t.pose.removalNote}</p>
      </div>
      <div className={styles.patchBox}>
        <p className={styles.eyebrow}>✦</p>
        <h3 className={styles.patchTitle}>{t.pose.removalPatchTitle}</h3>
        <p className={styles.patchText}>{t.pose.removalPatchText}</p>
      </div>
    </section>
  );
}
