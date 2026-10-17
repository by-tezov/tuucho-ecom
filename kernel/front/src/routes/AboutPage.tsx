import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { PageHero } from '../components/ui/PageHero';
import { About } from '../components/home/About';
import { Atelier } from '../components/about/Atelier';
import { IntroSurface } from '../components/ui/IntroSurface';
import styles from './AboutPage.module.css';

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
