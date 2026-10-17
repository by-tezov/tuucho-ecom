import { useCallback, useState } from 'react';
import { Seo } from '../components/seo/Seo';
import { LoadingModal } from '../components/ui/LoadingModal';
import { impersonateUser } from '../api/identity';
import { enterAdminGiftOffer, listAdminGiftOffers, type AdminGiftEnter, type AdminGiftOffer, type GiftStatus } from '../api/gift';
import { GIFT_RECEIVER_ISOLATED_KEY, giftPinStorageKey, writeImpersonationHandoff } from '../api/session/giftPinSession';
import { localizedPath } from '../config/i18nRoutes';
import { useAuthSession } from '../state/AuthContext';
import { setGiftCartFocus } from '../state/giftCartFocus';
import { useAdminInfiniteList } from '../hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '../components/admin/AdminInfiniteList';
import { useLang } from '../assets/i18n';
import type { AdminStrings } from '../assets/i18n/types';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { adminPath } from '../utils/adminRoute';
import { NotFoundPage } from './NotFoundPage';
import { formatPrice } from '../utils/formatPrice';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminGiftPage.module.css';

const OFFERS_CHUNK_SIZE = 20;

function dateTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function statusLabel(status: GiftStatus, admin: AdminStrings): string {
  switch (status) {
    case 'selecting':
      return admin.giftStatusSelecting;
    case 'awaiting_payment':
      return admin.giftStatusAwaitingPayment;
    case 'paying':
      return admin.giftStatusPaying;
    default:
      return status;
  }
}

export function AdminGiftPage() {
  const giftOn = usePluginEnabled('commerce-gift');
  const { t, lang } = useLang();
  const { authedRequest } = useAuthSession();
  const [pending, setPending] = useState<string | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);

  const openAs = useCallback(
    async (offer: AdminGiftOffer, role: AdminGiftEnter['role']) => {
      if (pending) return;
      const popup = window.open('about:blank', '_blank');
      if (!popup) {
        setEnterError(t.admin.giftEnterPopup);
        return;
      }
      const key = `${offer.id}:${role}`;
      setPending(key);
      setEnterError(null);
      try {
        const opened = await authedRequest(async (token) => {
          const entered = await enterAdminGiftOffer(token, offer.id, role);
          if (role === 'receiver') return { entered, session: null };
          const session = await impersonateUser(token, offer.giverEmail);
          return { entered, session };
        });
        if (role === 'giver') {
          if (!opened.session || !opened.entered.cartId) throw new Error('missing giver session');
          writeImpersonationHandoff(popup.sessionStorage, opened.session);
          popup.sessionStorage.setItem(
            giftPinStorageKey('giver', opened.entered.capabilityToken),
            opened.entered.pinToken,
          );
          setGiftCartFocus(opened.entered.cartId, popup.sessionStorage);
          popup.location.href = localizedPath('/cart', opened.entered.language);
          return;
        }
        popup.sessionStorage.setItem(GIFT_RECEIVER_ISOLATED_KEY, '1');
        popup.sessionStorage.setItem(
          giftPinStorageKey('receiver', opened.entered.capabilityToken),
          opened.entered.pinToken,
        );
        popup.location.href = localizedPath(`/gift/${opened.entered.capabilityToken}`, opened.entered.language);
      } catch {
        popup.close();
        setEnterError(t.admin.giftEnterError);
      } finally {
        setPending(null);
      }
    },
    [authedRequest, pending, t.admin.giftEnterError, t.admin.giftEnterPopup],
  );

  const fetchOffers = useCallback(
    async (page: number) => {
      const result = await withMinDuration(
        authedRequest((token) => listAdminGiftOffers(token, page, OFFERS_CHUNK_SIZE)),
        page === 1 ? 350 : 0,
      );
      return { rows: result.offers, page: result.pagination.page, totalPages: result.pagination.totalPages };
    },
    [authedRequest],
  );
  const {
    rows: offers,
    hasMore: offersHasMore,
    loading: offersLoading,
    loadingMore: offersLoadingMore,
    error: offersError,
    loadMore: loadMoreOffers,
  } = useAdminInfiniteList<AdminGiftOffer>({ fetchPage: fetchOffers, errorMessage: t.admin.actionError });

  if (!giftOn) return <NotFoundPage />;

  return (
    <section className={styles.section} aria-labelledby="admin-gift-h">
      <Seo
        title={t.admin.giftTitle}
        description={t.admin.giftDescription}
        path={adminPath('/gift')}
        noindex
      />
      <h1 id="admin-gift-h" className={styles.title}>
        {t.admin.giftTitle}
      </h1>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{t.admin.giftOffersTitle}</h2>
        <p className={styles.note}>{t.admin.giftOffersNote}</p>

        {offersError && (
          <p className={styles.error} role="alert">
            {offersError}
          </p>
        )}
        {enterError && (
          <p className={styles.error} role="alert">
            {enterError}
          </p>
        )}

        {offers.length === 0 && !offersLoading ? (
          <p className={styles.empty}>{t.admin.giftOffersEmpty}</p>
        ) : (
          <AdminInfiniteList
            className={styles.opsList}
            label={t.admin.giftOffersTitle}
            count={offers.length}
            rowKey={(index) => offers[index]!.id}
            hasMore={offersHasMore}
            loadingMore={offersLoadingMore}
            onLoadMore={loadMoreOffers}
            renderRow={(index) => {
              const offer = offers[index]!;
              return (
                <div className={styles.opsRow}>
                  <div className={styles.opsMain}>
                    <strong>{statusLabel(offer.status, t.admin)}</strong>
                    <span>
                      {t.admin.giftOfferGiverLabel}: {offer.giverDisplayName} ({offer.giverEmail})
                    </span>
                    <span>
                      {t.admin.giftOfferReceiverLabel}: {offer.receiverName}
                      {offer.receiverEmail ? ` (${offer.receiverEmail})` : ''}
                    </span>
                    <small>
                      {offer.allowAccessories ? t.admin.giftAccessoriesYes : t.admin.giftAccessoriesNo}
                    </small>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.textLink}
                        disabled={pending !== null}
                        onClick={() => void openAs(offer, 'giver')}
                      >
                        {t.admin.giftEnterGiver}
                      </button>
                      <button
                        type="button"
                        className={styles.textLink}
                        disabled={pending !== null}
                        onClick={() => void openAs(offer, 'receiver')}
                      >
                        {t.admin.giftEnterReceiver}
                      </button>
                    </div>
                  </div>
                  <div className={styles.opsMeta}>
                    <em>
                      {t.admin.giftOfferBudgetLabel}:{' '}
                      {offer.maxBudget == null ? '-' : formatPrice(offer.maxBudget)}
                    </em>
                    <time dateTime={offer.createdAt}>
                      {t.admin.giftOfferCreatedLabel}: {dateTime(offer.createdAt, lang)}
                    </time>
                    {offer.clocks.offerExpiresAt && (
                      <small>
                        {t.admin.giftOfferExpiresLabel}: {dateTime(offer.clocks.offerExpiresAt, lang)}
                      </small>
                    )}
                    {offer.clocks.holdExpiresAt && (
                      <small>
                        {t.admin.giftOfferHoldLabel}: {dateTime(offer.clocks.holdExpiresAt, lang)}
                      </small>
                    )}
                    {offer.clocks.payByAt && (
                      <small>
                        {t.admin.giftOfferPayByLabel}: {dateTime(offer.clocks.payByAt, lang)}
                      </small>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      {offersLoading && <LoadingModal message={t.admin.contentLoading} />}
    </section>
  );
}
