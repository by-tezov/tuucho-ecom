import { lazy, Suspense, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { Hero } from '@kernel/front/components/home/Hero';
import { Values } from '@kernel/front/components/home/Values';
import { About } from '@kernel/front/components/home/About';
import { CustomDesignCallout } from '@kernel/front/components/home/CustomDesignCallout';
import { HowToOrder } from '@kernel/front/components/home/HowToOrder';
import { CORE_FRONT_SLOTS, PluginSlot } from '@kernel/front/plugins/PluginHost';
import { IntroSurface } from '@kernel/front/components/ui/IntroSurface';
import { scrollToId } from '@kernel/front/utils/scroll';
import { receiverFollowsOrder } from '@kernel/front/api/gift';
import { useGiftLock } from '@kernel/front/hooks/useGiftLock';
import { useOptionalGiftReceiver } from '@kernel/front/hooks/useGiftReceiver';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import styles from '@kernel/front/routes/HomePage.module.css';

const Reviews = lazy(() => import('@kernel/front/components/home/Reviews'));

interface HomeLocationState {
  scrollTo?: string;
}

export function HomePage() {
  const { t } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const reviewsOn = usePluginEnabled('tuucho-commerce-vinted-review');
  const gift = useOptionalGiftReceiver();
  const { lock } = useGiftLock();
  const followOrder = receiverFollowsOrder(gift.summary?.status) || Boolean(lock?.followLocked);

  useEffect(() => {
    const state = location.state as HomeLocationState | null;
    if (!state?.scrollTo) return;
    const id = state.scrollTo;
    document.fonts.ready.then(() => requestAnimationFrame(() => scrollToId(id)));
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  return (
    <>
      <Seo title={t.seo.homeTitle} description={t.seo.homeDesc} path="/home" />
      <IntroSurface variant="warm">
        {!followOrder ? (
          <div className="backLinkTop">
            <LegalPageBackLink placement="top" />
          </div>
        ) : null}
        <div className={styles.heroWrap}>
          <Hero />
        </div>
      </IntroSurface>
      <PluginSlot name={CORE_FRONT_SLOTS.homeFeatured} />
      <Values />
      <About />
      <CustomDesignCallout />
      <HowToOrder />
      {reviewsOn ? (
        <Suspense fallback={null}>
          <Reviews />
        </Suspense>
      ) : null}
      <div className={styles.contactFaqWrap}>
        <PluginSlot name={CORE_FRONT_SLOTS.homeFaq} />
      </div>
      {!followOrder ? (
        <div className="backLinkBottom">
          <LegalPageBackLink placement="bottom" />
        </div>
      ) : null}
    </>
  );
}
