import { Navigate, useParams } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { Seo } from '@kernel/front/components/seo/Seo';
import { Button } from '@kernel/front/components/ui/Button';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { useGiftReceiver } from '@kernel/front/hooks/useGiftReceiver';
import { receiverFollowsOrder } from '@kernel/front/api/gift';
import { giftShopResumePath, readGiftLockSession } from '@kernel/front/state/giftLockSession';
import styles from '@kernel/front/components/gift/GiftFlow.module.css';

export function GiftReceiverApp() {
  const { token = '' } = useParams();
  const { t, lang } = useLang();
  const gift = useGiftReceiver();
  const lock = readGiftLockSession();
  const resume = lock?.receiverToken === token ? giftShopResumePath() : null;

  if (gift.error === 'gone') {
    return (
      <section className={styles.section}>
        <Seo title={t.gift.goneTitle} description={t.gift.goneBody} path={`/gift/${token}`} noindex />
        <h1 className={styles.title} data-testid="gift-gone-title">
          {t.gift.goneTitle}
        </h1>
        <p>{t.gift.goneBody}</p>
      </section>
    );
  }

  if (gift.pinRequired) {
    return (
      <section className={styles.section}>
        <Seo
          title={t.gift.pinBlockedTitle}
          description={t.gift.pinBlockedBody}
          path={`/gift/${token}`}
          noindex
        />
        <h1 className={styles.title}>{t.gift.pinBlockedTitle}</h1>
        <p>{t.gift.pinBlockedBody}</p>
        <Button type="button" data-testid="gift-pin-blocked-cta" onClick={gift.requestPin}>
          {t.gift.pinBlockedCta}
        </Button>
      </section>
    );
  }

  if (gift.error === 'inactive' || gift.error === 'load') {
    return (
      <section className={styles.section}>
        <Seo
          title={gift.error === 'inactive' ? t.gift.inactiveTitle : t.gift.receiverHello}
          description={gift.error === 'inactive' ? t.gift.inactiveBody : t.gift.loadError}
          path={`/gift/${token}`}
          noindex
        />
        <h1 className={styles.title}>
          {gift.error === 'inactive' ? t.gift.inactiveTitle : t.gift.receiverHello}
        </h1>
        <p>{gift.error === 'inactive' ? t.gift.inactiveBody : t.gift.loadError}</p>
      </section>
    );
  }

  if (lock?.followLocked) {
    return <Navigate to={localizedPath('/cart', lang)} replace />;
  }

  if (!gift.ready) {
    return (
      <section className={styles.section}>
        <Seo
          title={t.gift.receiverHello}
          description={t.gift.receiverHello}
          path={`/gift/${token}`}
          noindex
        />
        <LoadingModal message={t.gift.receiverEnterLoading} />
      </section>
    );
  }

  if (receiverFollowsOrder(gift.summary?.status)) {
    return <Navigate to={localizedPath('/cart', lang)} replace />;
  }

  if (resume) {
    return <Navigate to={resume} replace />;
  }

  return <Navigate to={localizedPath('/gallery', lang)} replace />;
}
