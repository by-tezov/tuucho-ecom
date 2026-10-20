import { useLang } from '@kernel/front/assets/i18n';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { PageHero } from '@kernel/front/components/ui/PageHero';
import { About } from '@kernel/front/components/home/About';
import { Atelier } from '@kernel/front/components/about/Atelier';
import { IntroSurface } from '@kernel/front/components/ui/IntroSurface';
import styles from '@kernel/front/routes/AboutPage.module.css';

export function AboutPage() {
  const { t } = useLang();

  return (
    <>
      <Seo title={t.seo.aboutTitle} description={t.seo.aboutDesc} path="/about" />
      <IntroSurface>
        <div className="backLinkTop">
          <LegalPageBackLink placement="top" />
        </div>
        <div className={styles.heroWrap}>
          <PageHero eyebrow={t.about.eyebrow} title={t.nav.about} />
        </div>
        <About showTitleOrnament />
      </IntroSurface>
      <div className={styles.lastSectionWrap}>
        <Atelier />
      </div>
      <div className="backLinkBottom">
        <LegalPageBackLink placement="bottom" />
      </div>
    </>
  );
}
