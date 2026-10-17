import { useState } from 'react';
import { useLang } from '../../assets/i18n';
import { announce } from '../../state/liveAnnouncer';
import {
  downloadGiftShareCard,
  emailGiftShareCard,
  patchGiftShareCard,
  type GiftShareCardStyle,
} from '../../api/gift';
import { FIELD_GIFT_COMMENT_MAX } from '../../utils/fieldLimits';
import { clampGiftComment, giftCommentFits } from '../../utils/giftComment';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { RequiredFieldsNote, RequiredMark } from '../ui/RequiredMark';
import { SegmentedSwitch } from '../ui/SegmentedSwitch';
import { GiftShareCardPreview, GiftShareCardStylePicker } from './GiftShareCardPreview';
import { formatShareCardExpiryCaption, giftOfferExpiresAt } from './shareCardExpiry';
import authFormStyles from '../auth/AuthForm.module.css';
import styles from './GiftShareCardDownloadModal.module.css';

const COMMENT_MAX = FIELD_GIFT_COMMENT_MAX;
type FieldErrors = Partial<Record<'receiverName' | 'giverComment', string>>;

interface GiftShareCardDownloadModalProps {
  token: string;
  giverDisplayName: string;
  receiverName: string;
  giverComment: string;
  shareCardStyle: GiftShareCardStyle;
  offerExpiresAt: string | null;
  authedRequest: <T>(fn: (accessToken: string) => Promise<T>) => Promise<T>;
  onClose: () => void;
  onSaved: (patch: {
    receiverName: string;
    giverComment: string;
    shareCardStyle: GiftShareCardStyle;
  }) => void;
}

export function GiftShareCardDownloadModal({
  token,
  giverDisplayName,
  receiverName: initialReceiverName,
  giverComment: initialGiverComment,
  shareCardStyle: initialShareCardStyle,
  offerExpiresAt,
  authedRequest,
  onClose,
  onSaved,
}: GiftShareCardDownloadModalProps) {
  const { t, lang } = useLang();
  const [receiverName, setReceiverName] = useState(initialReceiverName);
  const [giverComment, setGiverComment] = useState(initialGiverComment);
  const [shareCardStyle, setShareCardStyle] = useState(initialShareCardStyle);
  const [format, setFormat] = useState<'pdf' | 'jpg'>('pdf');
  const [busy, setBusy] = useState<'download' | 'email' | null>(null);
  const [succeeded, setSucceeded] = useState<'download' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  /** The sheet keeps the success message until the customer closes it: a
   * timed auto-close would fail RGAA 13.1. */
  function succeed(action: 'download' | 'email') {
    setSucceeded(action);
    announce(action === 'download' ? t.gift.shareCardDownloaded : t.gift.shareCardEmailSentNote);
  }

  function clearError(field: keyof FieldErrors) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  /** Same required/fits checks as useGiftCreateForm's onSubmit, same
   * `t.gift.fieldRequired` / `fieldCommentTooLong` copy. */
  function validate(): boolean {
    const next: FieldErrors = {};
    if (!receiverName.trim()) next.receiverName = t.gift.fieldRequired;
    if (!giverComment.trim()) next.giverComment = t.gift.fieldRequired;
    else if (!giftCommentFits(giverComment)) next.giverComment = t.gift.fieldCommentTooLong;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save(): Promise<void> {
    await authedRequest((access) =>
      patchGiftShareCard(token, { receiverName: receiverName.trim(), giverComment, shareCardStyle }, access),
    );
    onSaved({ receiverName: receiverName.trim(), giverComment, shareCardStyle });
  }

  async function onDownload(): Promise<void> {
    if (!validate()) return;
    setBusy('download');
    setError(null);
    try {
      await save();
      await authedRequest((access) => downloadGiftShareCard(token, format, access));
      setBusy(null);
      succeed('download');
    } catch {
      setBusy(null);
      setError(t.gift.genericError);
    }
  }

  async function onEmail(): Promise<void> {
    if (!validate()) return;
    setBusy('email');
    setError(null);
    try {
      await save();
      await authedRequest((access) => emailGiftShareCard(token, access));
      setBusy(null);
      succeed('email');
    } catch {
      setBusy(null);
      setError(t.gift.genericError);
    }
  }

  if (busy) {
    return (
      <LoadingModal
        message={busy === 'download' ? t.gift.shareCardDownloadLoading : t.gift.shareCardEmailLoading}
      />
    );
  }

  if (succeeded) {
    return (
      <BottomSheet title={t.gift.shareCardModalTitle} onClose={onClose} closeLabel={t.auth.closeAria}>
        <p className={styles.success} data-testid="gift-share-card-success">
          {succeeded === 'download' ? t.gift.shareCardDownloaded : t.gift.shareCardEmailSentNote}
        </p>
      </BottomSheet>
    );
  }

  const expiresAt = offerExpiresAt ? new Date(offerExpiresAt) : giftOfferExpiresAt(30);

  return (
    <BottomSheet
      title={t.gift.shareCardModalTitle}
      onClose={onClose}
      closeLabel={t.auth.closeAria}
      footer={
        <>
          <Button type="button" onClick={() => void onDownload()}>
            {t.gift.shareCardDownloadAction}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void onEmail()}>
            {t.gift.shareCardEmailAction}
          </Button>
        </>
      }
    >
      <GiftShareCardPreview
        style={shareCardStyle}
        message={giverComment}
        giverDisplayName={giverDisplayName}
        receiverName={receiverName}
        scanLabel={formatShareCardExpiryCaption(expiresAt, lang, t.gift.shareCardUseBefore)}
        qrAlt={t.gift.shareCardQrPreviewAlt}
        occasionLabel=""
      />
      <RequiredFieldsNote />
      <div className={authFormStyles.field}>
        <label className={authFormStyles.label} htmlFor="gift-share-card-receiver-name">
          {t.gift.receiverNameLabel}
          <RequiredMark />
        </label>
        <input
          id="gift-share-card-receiver-name"
          data-testid="gift-share-card-receiver-name"
          className={authFormStyles.input}
          value={receiverName}
          autoComplete="off"
          aria-required="true"
          aria-invalid={errors.receiverName != null}
          aria-describedby={errors.receiverName ? 'gift-share-card-receiver-name-error' : undefined}
          onChange={(event) => {
            setReceiverName(event.target.value);
            clearError('receiverName');
          }}
        />
        {errors.receiverName ? (
          <p
            id="gift-share-card-receiver-name-error"
            data-testid="gift-share-card-receiver-name-error"
            className={authFormStyles.fieldError}
            role="alert"
          >
            {errors.receiverName}
          </p>
        ) : null}
      </div>
      <div className={authFormStyles.field}>
        <label className={authFormStyles.label} htmlFor="gift-share-card-comment">
          {t.gift.giverCommentLabel}
          <RequiredMark />
        </label>
        <textarea
          id="gift-share-card-comment"
          data-testid="gift-share-card-comment"
          className={`${authFormStyles.input} ${styles.textarea}`}
          value={giverComment}
          maxLength={COMMENT_MAX}
          aria-required="true"
          aria-invalid={errors.giverComment != null}
          aria-describedby={
            errors.giverComment ? 'gift-share-card-comment-error' : 'gift-share-card-comment-hint'
          }
          onChange={(event) => {
            setGiverComment(clampGiftComment(event.target.value));
            clearError('giverComment');
          }}
        />
        {errors.giverComment ? (
          <p
            id="gift-share-card-comment-error"
            data-testid="gift-share-card-comment-error"
            className={authFormStyles.fieldError}
            role="alert"
          >
            {errors.giverComment}
          </p>
        ) : (
          <span id="gift-share-card-comment-hint" className={styles.charCount}>
            <span>{t.gift.giverCommentHint}</span>
            <span>
              {giverComment.length}/{COMMENT_MAX}
            </span>
          </span>
        )}
      </div>
      <div className={authFormStyles.field}>
        <span className={authFormStyles.label} id="gift-share-card-style-label">
          {t.gift.shareCardStyleLabel}
        </span>
        <GiftShareCardStylePicker
          value={shareCardStyle}
          onChange={setShareCardStyle}
          labels={t.gift.shareCardStyles}
          title={t.gift.shareCardStyleLabel}
        />
      </div>
      <div className={authFormStyles.field}>
        <span className={authFormStyles.label}>{t.gift.shareCardFormatLabel}</span>
        <SegmentedSwitch
          ariaLabel={t.gift.shareCardFormatLabel}
          activeKey={format}
          onSelect={(key) => setFormat(key === 'jpg' ? 'jpg' : 'pdf')}
          options={[
            { key: 'pdf', label: t.gift.shareCardFormatPdf, 'data-testid': 'gift-share-card-format-pdf' },
            { key: 'jpg', label: t.gift.shareCardFormatJpg, 'data-testid': 'gift-share-card-format-jpg' },
          ]}
        />
      </div>
      {error ? (
        <p className={authFormStyles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </BottomSheet>
  );
}
