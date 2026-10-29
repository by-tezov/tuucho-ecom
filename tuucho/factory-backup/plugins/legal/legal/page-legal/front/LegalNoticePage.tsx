import { Link } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { Seo } from '@kernel/front/components/seo/Seo';
import { shopConfig } from '@kernel/front/config/env';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import styles from '@kernel/front/routes/LegalPage.module.css';

export function LegalNoticePage() {
  const { t, lang } = useLang();

  return (
    <section aria-labelledby="legal-h" className={styles.section}>
      <Seo title={t.seo.legalTitle} description={t.seo.legalDesc} path="/legal" />
      <LegalPageBackLink />
      <p className={styles.eyebrow}>{t.legalNotice.eyebrow}</p>
      <h1 id="legal-h" className={styles.title}>
        {t.legalNotice.title}
      </h1>
      <p className={styles.updated}>{t.legalNotice.updated}</p>
      <p className={styles.intro}>{t.legalNotice.intro}</p>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.legalNotice.publisherTitle}</h2>
        <dl className={styles.dl}>
          <dt className={styles.dt}>{t.legalNotice.ownerLabel}</dt>
          <dd className={styles.dd}>{shopConfig.shopName}</dd>
          <dt className={styles.dt}>{t.legalNotice.emailLabel}</dt>
          <dd className={styles.dd}>{shopConfig.contactEmail}</dd>
        </dl>
        <p className={styles.p} style={{ marginTop: 14 }}>
          {t.legalNotice.publisherNote}
        </p>
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.legalNotice.ipTitle}</h2>
        <p className={styles.p}>{t.legalNotice.ipBody}</p>
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.legalNotice.dataTitle}</h2>
        <p className={styles.p}>
          {t.legalNotice.dataBody} <Link to={localizedPath('/privacy', lang)}>{t.footer.privacyLink}</Link>
        </p>
      </div>

      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
