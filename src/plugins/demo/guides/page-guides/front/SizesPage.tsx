import { useLang } from '@kernel/front/assets/i18n';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { GuideHero } from '@kernel/front/components/guide/GuideHero';
import { StandardSizes } from '@kernel/front/components/guide/StandardSizes';
import { IntroSurface } from '@kernel/front/components/ui/IntroSurface';
import styles from '@kernel/front/routes/GuidePage.module.css';

export function SizesPage() {
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
