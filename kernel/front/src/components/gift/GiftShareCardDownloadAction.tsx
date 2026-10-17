import { useState } from 'react';
import { useLang } from '../../assets/i18n';
import type { GiftShareCardStyle, GiftStatus } from '../../api/gift';
import { Button } from '../ui/Button';
import { GiftShareCardDownloadModal } from './GiftShareCardDownloadModal';

interface GiftShareCardDownloadActionProps {
  giftStatus: GiftStatus | undefined;
  giverToken: string | null | undefined;
  giverDisplayName: string;
  receiverName: string;
  giverComment: string;
  shareCardStyle: GiftShareCardStyle | undefined;
  offerExpiresAt: string | null;
  authedRequest: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
  onSaved: (patch: {
    receiverName: string;
    giverComment: string;
    shareCardStyle: GiftShareCardStyle;
  }) => void;
}

/** The gift cart status block's "download gift card" button, plus the
 * edit/download/email modal it opens. Self-contained (owns its own open
 * state) so the cart page only wires data through, not UI state — see
 * GiftShareCardDownloadModal for the actual form. Only shown while Julie
 * has not confirmed her choice yet (`selecting`), same gate as the giver
 * router's `PATCH .../share-card`. */
export function GiftShareCardDownloadAction({
  giftStatus,
  giverToken,
  giverDisplayName,
  receiverName,
  giverComment,
  shareCardStyle,
  offerExpiresAt,
  authedRequest,
  onSaved,
}: GiftShareCardDownloadActionProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  if (giftStatus !== 'selecting' || !giverToken) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        data-testid="gift-share-card-download"
        onClick={() => setOpen(true)}
      >
        {t.gift.shareCardDownloadCta}
      </Button>
      {open ? (
        <GiftShareCardDownloadModal
          token={giverToken}
          giverDisplayName={giverDisplayName}
          receiverName={receiverName}
          giverComment={giverComment}
          shareCardStyle={shareCardStyle ?? 'pamsurin'}
          offerExpiresAt={offerExpiresAt}
          authedRequest={authedRequest}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}
