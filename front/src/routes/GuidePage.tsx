import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { GuideHero } from '../components/guide/GuideHero';
import { StandardSizes } from '../components/guide/StandardSizes';
import { IntroSurface } from '../components/ui/IntroSurface';
import styles from './GuidePage.module.css';

export function GuidePage() {
  const { t } = useLang();

  return (
    <>
      <Seo title={t.seo.guideTitle} description={t.seo.guideDesc} path="/sizes" />
      <IntroSurface variant="warm">
        <div className="backLinkTop">
          <LegalPageBackLink placement="top" />
        </div>
        <div className={styles.heroWrap}>
          <GuideHero />
        </div>
        <StandardSizes />
      </IntroSurface>
      <div className="backLinkBottom">
        <LegalPageBackLink placement="bottom" />
      </div>
    </>
  );
}
