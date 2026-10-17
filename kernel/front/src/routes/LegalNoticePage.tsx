import { Link } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Seo } from '../components/seo/Seo';
import { shopConfig, legalConfig, hostConfig } from '../config/env';
import { localizedPath } from '../config/i18nRoutes';
import styles from './LegalPage.module.css';

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
          <dd className={styles.dd}>{legalConfig.owner}</dd>
          <dt className={styles.dt}>{t.legalNotice.statusLabel}</dt>
          <dd className={styles.dd}>{legalConfig.status}</dd>
          <dt className={styles.dt}>{t.legalNotice.sirenLabel}</dt>
          <dd className={styles.dd}>{legalConfig.siren}</dd>
          <dt className={styles.dt}>{t.legalNotice.addressLabel}</dt>
          <dd className={styles.dd}>{legalConfig.address}</dd>
          <dt className={styles.dt}>{t.legalNotice.vatLabel}</dt>
          <dd className={styles.dd}>{legalConfig.vat}</dd>
          {legalConfig.phone && (
            <>
              <dt className={styles.dt}>{t.legalNotice.phoneLabel}</dt>
              <dd className={styles.dd}>{legalConfig.phone}</dd>
            </>
          )}
          <dt className={styles.dt}>{t.legalNotice.emailLabel}</dt>
          <dd className={styles.dd}>{shopConfig.contactEmail}</dd>
        </dl>
        <p className={styles.p} style={{ marginTop: 14 }}>
          {t.legalNotice.publisherNote}
        </p>
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.legalNotice.hostTitle}</h2>
        <dl className={styles.dl}>
          <dt className={styles.dt}>{t.legalNotice.hostNameLabel}</dt>
          <dd className={styles.dd}>{hostConfig.name}</dd>
          <dt className={styles.dt}>{t.legalNotice.hostAddressLabel}</dt>
          <dd className={styles.dd}>{hostConfig.address}</dd>
          {hostConfig.phone && (
            <>
              <dt className={styles.dt}>{t.legalNotice.hostPhoneLabel}</dt>
              <dd className={styles.dd}>{hostConfig.phone}</dd>
            </>
          )}
          <dt className={styles.dt}>{t.legalNotice.hostWebsiteLabel}</dt>
          <dd className={styles.dd}>{hostConfig.website}</dd>
        </dl>
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
