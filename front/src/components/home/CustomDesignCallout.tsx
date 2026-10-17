import { useLang } from '../../assets/i18n';
import { Button } from '../ui/Button';
import { localizedPath } from '../../config/i18nRoutes';
import styles from './CustomDesignCallout.module.css';

function SparkleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M11 2c.6 3.4 1.7 5.4 4 6.5S18.6 10.4 20 11c-3.4.6-5.4 1.7-6.5 4S11.6 19.6 11 21c-.6-3.4-1.7-5.4-4-6.5S3.4 12.6 2 12c3.4-.6 5.4-1.7 6.5-4S10.4 3.4 11 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CustomDesignCallout() {
  const { t, lang } = useLang();

  return (
    <section aria-labelledby="custom-design-h" className={styles.section}>
      <div className={styles.card}>
        <div aria-hidden="true" className={styles.icon}>
          <SparkleIcon />
        </div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>{t.customDesign.eyebrow}</p>
          <h2 id="custom-design-h" className={styles.title}>
            {t.customDesign.title}
          </h2>
          <p className={styles.text}>{t.customDesign.text}</p>
        </div>
        <Button to={localizedPath('/contact', lang)} className={styles.cta}>
          {t.contact.pageCta}
        </Button>
      </div>
    </section>
  );
}
