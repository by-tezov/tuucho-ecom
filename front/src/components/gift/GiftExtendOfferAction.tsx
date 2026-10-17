import { useState } from 'react';
import { useLang } from '../../assets/i18n';
import { extendGiftOffer, type GiftStatus } from '../../api/gift';
import { ApiError } from '../../api/errors';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { StatusModal } from '../ui/StatusModal';

interface GiftExtendOfferActionProps {
  giftStatus: GiftStatus | undefined;
  giverToken: string | null | undefined;
  /** `canExtend` from the giver payload: the backend already knows whether
   * another two weeks would pass `GIFT_EXTEND_CEILING_DAYS`, so the button
   * is not drawn at all once the offer is parked as far out as allowed. */
  canExtend: boolean | undefined;
  authedRequest: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
  onExtended: (next: { offerExpiresAt: string | null; canExtend: boolean }) => void;
  /** Message slot owned by the status block, so the extend failure lands in
   * the same place as the cancel failure instead of inside the button row. */
  onError: (message: string | null) => void;
}

/** The gift cart status block's "two more weeks" button, next to the
 * share-card download. Same `selecting`-only gate as that one: once the
 * receiver has confirmed, the live clocks are the stock hold and the pay
 * deadline, which this never moves. Hidden, not disabled, once the offer
 * has reached the backend's extension ceiling. */
export function GiftExtendOfferAction({
  giftStatus,
  giverToken,
  canExtend,
  authedRequest,
  onExtended,
  onError,
}: GiftExtendOfferActionProps) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  // Not an early return: the component stays mounted while the success
  // dialog runs, and extending is exactly what turns `canExtend` false.
  const offersExtend = giftStatus === 'selecting' && Boolean(giverToken) && canExtend === true;

  async function onExtend(): Promise<void> {
    if (!giverToken) return;
    setBusy(true);
    onError(null);
    try {
      const result = await authedRequest((access) => extendGiftOffer(giverToken, access));
      setBusy(false);
      onExtended({ offerExpiresAt: result.offerExpiresAt, canExtend: result.canExtend });
      setSucceeded(true);
    } catch (caught) {
      setBusy(false);
      onError(
        caught instanceof ApiError && caught.code === 'gift_extend_limit'
          ? t.gift.extendLimit
          : t.gift.genericError,
      );
    }
  }

  return (
    <>
      {offersExtend ? (
        <Button
          type="button"
          variant="ghost"
          data-testid="gift-extend-offer"
          disabled={busy}
          onClick={() => void onExtend()}
        >
          {t.gift.extendCta}
        </Button>
      ) : null}
      {busy ? <LoadingModal message={t.gift.extendLoading} /> : null}
      {succeeded ? <StatusModal message={t.gift.extendDone} onClose={() => setSucceeded(false)} /> : null}
    </>
  );
}
