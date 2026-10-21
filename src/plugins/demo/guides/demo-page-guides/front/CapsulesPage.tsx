import { Link } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { PageHero } from '@kernel/front/components/ui/PageHero';
import { IntroSurface } from '@kernel/front/components/ui/IntroSurface';
import { CAPSULE_FORM_KEYS } from '@kernel/front/data/capsuleForms';
import styles from './CapsulesPage.module.css';

export function CapsulesPage() {
  const { t, lang } = useLang();

  return (
    <>
      <Seo title={t.seo.capsulesTitle} description={t.seo.capsulesDesc} path="/capsules" />
      <IntroSurface>
        <div className="backLinkTop">
          <LegalPageBackLink placement="top" />
        </div>
        <div className={styles.heroWrap}>
          <PageHero eyebrow={t.capsules.eyebrow} title={t.capsules.title} />
        </div>
        <p className={styles.intro}>{t.capsules.intro}</p>
        <section>
          <h2>{t.capsules.shapesTitle}</h2>
          <p>{t.capsules.shapesSub}</p>
          <ul>
            {CAPSULE_FORM_KEYS.map((key) => {
              const copy = t.capsules.forms[key];
              return (
                <li key={key}>
                  <strong>{copy.name}</strong>
                  <p>{copy.desc}</p>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h2>{t.capsules.lengthsTitle}</h2>
          <p>{t.capsules.lengthsSub}</p>
        </section>
      </IntroSurface>
      <aside className={styles.moreNote}>
        <div className={styles.moreNoteBox}>
          <span aria-hidden="true" className={styles.moreNoteIcon}>
            ✦
          </span>
          <p className={styles.moreNoteText}>
            {t.capsules.moreNoteBefore}
            <Link to={localizedPath('/contact', lang)} className={styles.moreNoteLink}>
              {t.capsules.moreNoteLink}
            </Link>
            {t.capsules.moreNoteAfter}
          </p>
        </div>
      </aside>
      <div className="backLinkBottom">
        <LegalPageBackLink placement="bottom" />
      </div>
    </>
  );
}
