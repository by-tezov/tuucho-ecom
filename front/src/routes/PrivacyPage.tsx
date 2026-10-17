import { useLang } from '../assets/i18n';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Seo } from '../components/seo/Seo';
import { shopConfig } from '../config/env';
import styles from './LegalPage.module.css';

export function PrivacyPage() {
  const { t } = useLang();

  return (
    <section aria-labelledby="privacy-h" className={styles.section}>
      <Seo title={t.seo.privacyTitle} description={t.seo.privacyDesc} path="/privacy" />
      <LegalPageBackLink />
      <p className={styles.eyebrow}>{t.privacy.eyebrow}</p>
      <h1 id="privacy-h" className={styles.title}>
        {t.privacy.title}
      </h1>
      <p className={styles.updated}>{t.privacy.updated}</p>

      {t.privacy.sections.map((section) => (
        <div key={section.title} className={styles.block}>
          <h2 className={styles.blockTitle}>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className={styles.p}>
              {paragraph.replaceAll(
                '{guestStorageRetentionDays}',
                String(shopConfig.guestStorageRetentionDays),
              )}
            </p>
          ))}
        </div>
      ))}

      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
