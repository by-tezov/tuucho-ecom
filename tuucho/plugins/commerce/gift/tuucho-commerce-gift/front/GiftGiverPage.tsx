import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { Seo } from '@kernel/front/components/seo/Seo';
import { GiftPinModal } from '@kernel/front/components/GiftPinModal';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { ApiError } from '@kernel/front/api/errors';
import { getGiverPortal, openGiftPay, unlockGiftPin } from '@kernel/front/api/gift';
import { useAuthCommands, useAuthSession } from '@kernel/front/state/AuthContext';
import { setGiftCartFocus } from '@kernel/front/state/giftCartFocus';
import { releaseReceiverLockIfGiverPath } from '@kernel/front/state/giftLockSession';
import { readGiftPinGrant } from '@kernel/front/api/session/giftPinSession';
import styles from '@kernel/front/components/gift/GiftFlow.module.css';

export function GiftGiverPage() {
  const { token = '' } = useParams();
  const { t, lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, authedRequest } = useAuthSession();
  const { completeGiftGiverEnter } = useAuthCommands();
  const enterRef = useRef(completeGiftGiverEnter);
  enterRef.current = completeGiftGiverEnter;
  const langRef = useRef(lang);
  langRef.current = lang;
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  useLayoutEffect(() => {
    releaseReceiverLockIfGiverPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    startedRef.current = false;
    setPinOpen(false);
    setError(null);
  }, [token]);

  useEffect(() => {
    if (!token || status === 'loading') return;
    if (pinOpen) return;
    if (startedRef.current) return;

    // The mailed "espace cadeau" link is not a login. Only a remembered
    // session for this giver may skip the PIN. Anyone else (no account, or
    // signed out) must unlock the PIN before open-pay can create or attach
    // the shop account.
    if (status !== 'authenticated' && readGiftPinGrant('giver', token) == null) {
      setPinOpen(true);
      return;
    }

    startedRef.current = true;
    void (async () => {
      try {
        if (status === 'authenticated') {
          const loaded = await authedRequest((access) => getGiverPortal(token, access));
          if (loaded.status === 'ordered' || loaded.status === 'cancelled' || loaded.status === 'expired') {
            setError('gone');
            return;
          }
          if (loaded.cartId) {
            setGiftCartFocus(loaded.cartId);
            navigate(localizedPath('/cart', langRef.current), { replace: true });
            return;
          }
          const opened = await authedRequest((access) => openGiftPay(token, access));
          setGiftCartFocus(opened.cartId);
          navigate(localizedPath('/cart', langRef.current), { replace: true });
          return;
        }
        const loaded = await getGiverPortal(token);
        if (loaded.status === 'ordered' || loaded.status === 'cancelled' || loaded.status === 'expired') {
          setError('gone');
          return;
        }
        const opened = await enterRef.current(() => openGiftPay(token));
        setGiftCartFocus(opened.cartId);
        navigate(localizedPath('/cart', langRef.current), { replace: true });
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.code === 'gift_pin_required' || err.code === 'gift_pin_invalid')
        ) {
          startedRef.current = false;
          setPinOpen(true);
          return;
        }
        setError(err instanceof ApiError && err.code === 'gift_gone' ? 'gone' : 'load');
      }
    })();
  }, [status, token, navigate, pinOpen, authedRequest]);

  if (error === 'gone') {
    return (
      <section className={styles.section}>
        <Seo title={t.gift.goneTitle} description={t.gift.goneBody} path={`/gift/giver/${token}`} noindex />
        <h1 className={styles.title} data-testid="gift-gone-title">
          {t.gift.goneTitle}
        </h1>
        <p>{t.gift.goneBody}</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <Seo title={t.gift.giverTitle} description={t.gift.giverTitle} path={`/gift/giver/${token}`} noindex />
      {pinOpen ? (
        <>
          <h1 className={styles.title}>{t.gift.pinBlockedTitle}</h1>
          <p>{t.gift.pinBlockedBody}</p>
          <GiftPinModal
            loadingMessage={t.gift.giverEnterLoading}
            onUnlock={async (pin) => {
              await unlockGiftPin('giver', token, pin);
              setPinOpen(false);
            }}
            onClose={() => undefined}
          />
        </>
      ) : error ? (
        <p>{t.gift.loadError}</p>
      ) : (
        <LoadingModal message={t.gift.giverEnterLoading} />
      )}
    </section>
  );
}
