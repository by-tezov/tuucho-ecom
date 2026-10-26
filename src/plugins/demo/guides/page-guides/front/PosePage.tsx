import { useLayoutEffect } from 'react';
import { useLang } from '@kernel/front/assets/i18n';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { PageHero } from '@kernel/front/components/ui/PageHero';
import { IntroSurface } from '@kernel/front/components/ui/IntroSurface';
import { scrollWindowInstant } from '@kernel/front/utils/scroll';
import styles from './PosePage.module.css';

export function PosePage() {
  const { t } = useLang();

  useLayoutEffect(() => {
    scrollWindowInstant(0);
  }, []);

  return (
    <>
      <Seo title={t.seo.poseTitle} description={t.seo.poseDesc} path="/pose" />
      <IntroSurface>
        <div className="backLinkTop">
          <LegalPageBackLink placement="top" />
        </div>
        <div className={styles.heroWrap}>
          <PageHero eyebrow={t.pose.eyebrow} title={t.pose.title} />
        </div>
        <p>{t.pose.intro}</p>
        <section>
          <h2>{t.pose.kitTitle}</h2>
          <p>{t.pose.kitText}</p>
        </section>
        <section>
          <h2>{t.pose.prepTitle}</h2>
          <p>{t.pose.prepSub}</p>
          <ol>
            {t.pose.steps.map((step) => (
              <li key={`${step.n}-${step.title}`}>
                <strong>
                  {step.n}. {step.title}
                </strong>
                <p>{step.desc}</p>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2>{t.pose.removalTitle}</h2>
          <p>{t.pose.removalSub}</p>
          <p>{t.pose.removalNote}</p>
        </section>
      </IntroSurface>
      <div className="backLinkBottom">
        <LegalPageBackLink placement="bottom" />
      </div>
    </>
  );
}
