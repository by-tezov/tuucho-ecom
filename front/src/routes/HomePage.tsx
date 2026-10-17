import { lazy, Suspense, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Hero } from '../components/home/Hero';
import { NewArrivals } from '../components/home/NewArrivals';
import { Values } from '../components/home/Values';
import { About } from '../components/home/About';
import { CustomDesignCallout } from '../components/home/CustomDesignCallout';
import { HowToOrder } from '../components/home/HowToOrder';
import { ContactFaq } from '../components/home/ContactFaq';
import { IntroSurface } from '../components/ui/IntroSurface';
import { scrollToId } from '../utils/scroll';
import { receiverFollowsOrder } from '../api/gift';
import { useGiftLock } from '../hooks/useGiftLock';
import { useOptionalGiftReceiver } from '../hooks/useGiftReceiver';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import styles from './HomePage.module.css';

// Far below the fold and hidden until reviews are chosen in admin: loaded
// after first paint, off the entry bundle (see check:bundle).
const Reviews = lazy(() => import('../components/home/Reviews'));

interface HomeLocationState {
  scrollTo?: string;
}

export function HomePage() {
  const { t } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const reviewsOn = usePluginEnabled('commerce-reviews');
  const gift = useOptionalGiftReceiver();
  const { lock } = useGiftLock();
  const followOrder = receiverFollowsOrder(gift.summary?.status) || Boolean(lock?.followLocked);

  useEffect(() => {
    const state = location.state as HomeLocationState | null;
    if (!state?.scrollTo) return;
    const id = state.scrollTo;
    // Wait for web fonts to finish loading first — a font swap after the
    // scroll target is computed reflows the page and throws the target off.
    document.fonts.ready.then(() => requestAnimationFrame(() => scrollToId(id)));
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  return (
    <>
      <Seo title={t.seo.homeTitle} description={t.seo.homeDesc} path="/home" />
      {/* Mobile-only (see LegalPageBackLink.module.css) — Accueil lives at
          `/home` (entry splash owns `/`). Soft Accueil is deliberate via
          brand/nav; mobile needs an explicit way out. Home also hides the
          bottom tab bar (MobileTabBar HIDDEN_PATHS) since this back link
          already covers "leave the page". After a gift confirm, Accueil
          becomes a tab: the bar stays and these back links are omitted. */}
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
      <NewArrivals />
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
        <ContactFaq />
      </div>
      {!followOrder ? (
        <div className="backLinkBottom">
          <LegalPageBackLink placement="bottom" />
        </div>
      ) : null}
    </>
  );
}
