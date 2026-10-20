import { useLang } from '@kernel/front/assets/i18n';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { Seo } from '@kernel/front/components/seo/Seo';
import styles from '@kernel/front/routes/LegalPage.module.css';

export function TermsPage() {
  const { t } = useLang();

  return (
    <section aria-labelledby="terms-h" className={styles.section}>
      <Seo title={t.seo.termsTitle} description={t.seo.termsDesc} path="/terms" />
      <LegalPageBackLink />
      <p className={styles.eyebrow}>{t.terms.eyebrow}</p>
      <h1 id="terms-h" className={styles.title}>
        {t.terms.title}
      </h1>
      <p className={styles.updated}>{t.terms.updated}</p>

      {t.terms.sections.map((section) => (
        <div key={section.title} className={styles.block}>
          <h2 className={styles.blockTitle}>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className={styles.p}>
              {paragraph}
            </p>
          ))}
        </div>
      ))}

      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
