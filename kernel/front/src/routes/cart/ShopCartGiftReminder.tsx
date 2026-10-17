import type { Strings } from '../../assets/i18n';
import { GiftCartReminder } from '../../components/gift/GiftCartReminder';
import { GiftExtendOfferAction } from '../../components/gift/GiftExtendOfferAction';
import { GiftShareCardDownloadAction } from '../../components/gift/GiftShareCardDownloadAction';
import { Button } from '../../components/ui/Button';
import { unlockGiftCart, type GiftSummary } from '../../api/gift';
import type { CartGiftMeta } from '../../api/cart';
import styles from '../CartPage.module.css';

interface ShopCartGiftReminderProps {
  t: Strings;
  giftSummary: GiftSummary | null;
  setGiftSummary: (updater: (prev: GiftSummary | null) => GiftSummary | null) => void;
  cartGift: CartGiftMeta | null | undefined;
  giftStatus: GiftSummary['status'] | undefined;
  giftPayable: boolean;
  giftLocked: boolean;
  giftUnlocking: boolean;
  setGiftUnlocking: (value: boolean) => void;
  giftCancelling: boolean;
  giftActionError: string | null;
  setGiftActionError: (value: string | null) => void;
  setGiftConfirm: (value: 'cancel' | null) => void;
  authedRequest: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
  refreshCart: () => void;
}

/** The gift cart's status block: recap, offer expiry, "download gift card"
 * and "extend by two weeks" actions (giver-side, pre-confirm only),
 * unlock-cart, and cancel-offer. Pulled out
 * of ShopCartPage to keep that route file under its architecture ratchet. */
export function ShopCartGiftReminder({
  t,
  giftSummary,
  setGiftSummary,
  cartGift,
  giftStatus,
  giftPayable,
  giftLocked,
  giftUnlocking,
  setGiftUnlocking,
  giftCancelling,
  giftActionError,
  setGiftActionError,
  setGiftConfirm,
  authedRequest,
  refreshCart,
}: ShopCartGiftReminderProps) {
  return (
    <>
      <GiftCartReminder
        summary={giftSummary}
        cartGift={cartGift ?? null}
        statusLabel={giftPayable ? t.gift.statusWaitingPayment : t.gift.statusWaitingReceiver}
        lockNote={
          giftStatus === 'selecting'
            ? t.gift.selectingLockedNote
            : giftLocked && giftPayable
              ? t.gift.unlockCartHint
              : null
        }
        expiresAt={giftSummary?.clocks.offerExpiresAt ?? null}
      >
        <GiftShareCardDownloadAction
          giftStatus={giftStatus}
          giverToken={cartGift?.giverToken}
          giverDisplayName={giftSummary?.giverDisplayName ?? ''}
          receiverName={giftSummary?.receiverName ?? ''}
          giverComment={giftSummary?.giverComment ?? ''}
          shareCardStyle={giftSummary?.shareCardStyle}
          offerExpiresAt={giftSummary?.clocks.offerExpiresAt ?? null}
          authedRequest={authedRequest}
          onSaved={(patch) => setGiftSummary((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
        <GiftExtendOfferAction
          giftStatus={giftStatus}
          giverToken={cartGift?.giverToken}
          canExtend={giftSummary?.canExtend}
          authedRequest={authedRequest}
          onExtended={({ offerExpiresAt, canExtend }) =>
            setGiftSummary((prev) =>
              prev ? { ...prev, canExtend, clocks: { ...prev.clocks, offerExpiresAt } } : prev,
            )
          }
          onError={setGiftActionError}
        />
        {giftLocked && giftPayable ? (
          <Button
            type="button"
            data-testid="gift-unlock-cart"
            disabled={giftUnlocking}
            onClick={() => {
              const token = cartGift?.giverToken;
              if (!token) return;
              setGiftUnlocking(true);
              void authedRequest((access) => unlockGiftCart(token, access))
                .then(() => refreshCart())
                .finally(() => setGiftUnlocking(false));
            }}
          >
            {t.gift.unlockCart}
          </Button>
        ) : null}
        {giftStatus !== 'ordered' ? (
          <Button
            type="button"
            variant="ghostDanger"
            data-testid="gift-cancel-offer"
            disabled={giftCancelling}
            onClick={() => {
              setGiftActionError(null);
              setGiftConfirm('cancel');
            }}
          >
            {t.gift.cancelCta}
          </Button>
        ) : null}
      </GiftCartReminder>
      {giftActionError ? (
        <p className={styles.error} role="alert">
          {giftActionError}
        </p>
      ) : null}
    </>
  );
}
