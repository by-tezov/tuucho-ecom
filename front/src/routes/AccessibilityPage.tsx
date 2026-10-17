import { Link } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Seo } from '../components/seo/Seo';
import { shopConfig } from '../config/env';
import { localizedPath } from '../config/i18nRoutes';
import styles from './LegalPage.module.css';

/** The RGAA accessibility statement, linked from every page's footer by the
 * "Accessibilité : partiellement conforme" mention (copy in
 * `accessibilityStatement`). */
export function AccessibilityPage() {
  const { t, lang } = useLang();
  const s = t.accessibilityStatement;

  return (
    <section aria-labelledby="accessibility-h" className={styles.section}>
      <Seo title={t.seo.accessibilityTitle} description={t.seo.accessibilityDesc} path="/accessibility" />
      <LegalPageBackLink />
      <p className={styles.eyebrow}>{s.eyebrow}</p>
      <h1 id="accessibility-h" className={styles.title}>
        {s.title}
      </h1>
      <p className={styles.updated}>{s.updated}</p>
      <p className={styles.intro}>{s.intro}</p>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{s.statusTitle}</h2>
        {s.statusBody.map((paragraph) => (
          <p key={paragraph} className={styles.p}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{s.issuesTitle}</h2>
        <p className={styles.p}>{s.issuesIntro}</p>
        <ul className={styles.bulletList}>
          {s.issues.map((issue) => (
            <li key={issue} className={styles.p}>
              {issue}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{s.preparationTitle}</h2>
        {s.preparationBody.map((paragraph) => (
          <p key={paragraph} className={styles.p}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{s.contactTitle}</h2>
        <p className={styles.p}>{s.contactBody}</p>
        <dl className={`${styles.dl} ${styles.dlSpaced}`}>
          <dt className={styles.dt}>{s.contactEmailLabel}</dt>
          <dd className={styles.dd}>
            <a href={`mailto:${shopConfig.contactEmail}`}>{shopConfig.contactEmail}</a>
          </dd>
          <dt className={styles.dt}>{s.contactFormLabel}</dt>
          <dd className={styles.dd}>
            <Link to={localizedPath('/contact', lang)}>{s.contactPageLink}</Link>
          </dd>
        </dl>
      </div>

      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
