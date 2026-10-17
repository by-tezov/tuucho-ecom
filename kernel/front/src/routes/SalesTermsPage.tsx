import { useLang } from '../assets/i18n';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Seo } from '../components/seo/Seo';
import { mediatorConfig } from '../config/env';
import styles from './LegalPage.module.css';

export function SalesTermsPage() {
  const { t } = useLang();

  return (
    <section aria-labelledby="sales-terms-h" className={styles.section}>
      <Seo title={t.seo.salesTermsTitle} description={t.seo.salesTermsDesc} path="/sales-terms" />
      <LegalPageBackLink />
      <p className={styles.eyebrow}>{t.salesTerms.eyebrow}</p>
      <h1 id="sales-terms-h" className={styles.title}>
        {t.salesTerms.title}
      </h1>
      <p className={styles.updated}>{t.salesTerms.updated}</p>

      {t.salesTerms.sections.map((section) => (
        <div key={section.title} className={styles.block}>
          <h2 className={styles.blockTitle}>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className={styles.p}>
              {paragraph}
            </p>
          ))}
        </div>
      ))}

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.salesTerms.mediationTitle}</h2>
        <p className={styles.p}>{t.salesTerms.mediationIntro}</p>
        {mediatorConfig.name && (
          <dl className={styles.dl} style={{ marginTop: 12 }}>
            <dt className={styles.dt}>{t.salesTerms.mediationNameLabel}</dt>
            <dd className={styles.dd}>{mediatorConfig.name}</dd>
            {mediatorConfig.website && (
              <>
                <dt className={styles.dt}>{t.salesTerms.mediationWebsiteLabel}</dt>
                <dd className={styles.dd}>{mediatorConfig.website}</dd>
              </>
            )}
          </dl>
        )}
      </div>

      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
