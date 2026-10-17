import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { GiftCornerMark } from '../layout/GiftCornerMark';
import { RequiredMark } from '../ui/RequiredMark';
import authFormStyles from '../auth/AuthForm.module.css';
import cartStyles from '../cart/CartFeature.module.css';
import styles from './GiftOrderSummary.module.css';

interface GiftOrderSummaryProps {
  t: Strings;
  giverDisplayName: string;
  giverComment: string | null;
  remainingBudget: number | null;
  remainingAccessoryBudget: number | null;
  hidePrices: boolean;
  allowAccessories: boolean;
  canConfirm: boolean;
  emailReady: boolean;
  alreadyConfirmed: boolean;
  confirmedNotice: boolean;
  busy: boolean;
  receiverEmail: string;
  receiverEmailError: string | null;
  onReceiverEmailChange: (value: string) => void;
  onConfirm: () => void;
}

export function GiftOrderSummary({
  t,
  giverDisplayName,
  giverComment,
  remainingBudget,
  remainingAccessoryBudget,
  hidePrices,
  allowAccessories,
  canConfirm,
  emailReady,
  alreadyConfirmed,
  confirmedNotice,
  busy,
  receiverEmail,
  receiverEmailError,
  onReceiverEmailChange,
  onConfirm,
}: GiftOrderSummaryProps) {
  const showBudget = !hidePrices && remainingBudget != null;
  const showAccessoryBudget =
    !hidePrices && remainingAccessoryBudget != null && (allowAccessories || remainingAccessoryBudget > 0);
  const emailFieldId = 'gift-receiver-email';
  const emailErrorId = 'gift-receiver-email-error';
  const emailHintId = 'gift-receiver-email-hint';

  return (
    <div
      className={`${cartStyles.summaryCard} ${styles.card} ${emailReady ? cartStyles.summaryCardReady : ''}`}
    >
      <GiftCornerMark />
      <h2 className={cartStyles.summaryTitle}>{t.cart.summaryHeading}</h2>

      <div className={styles.metaBlock}>
        <p className={styles.metaLabel}>{t.gift.recapFromLabel}</p>
        <p className={styles.metaValue}>{giverDisplayName}</p>
      </div>

      {giverComment ? (
        <div className={styles.metaBlock}>
          <p className={styles.metaLabel}>{t.gift.recapMessageLabel}</p>
          <p className={styles.metaValue}>{giverComment}</p>
        </div>
      ) : null}

      {showBudget ? (
        <p className={styles.remaining} data-testid="gift-remaining-budget">
          {t.gift.remainingBudget.replace('{n}', String(remainingBudget))}
        </p>
      ) : null}
      {showAccessoryBudget ? (
        <p className={styles.remaining} data-testid="gift-remaining-accessory-budget">
          {t.gift.remainingAccessoryBudget.replace('{n}', String(remainingAccessoryBudget))}
        </p>
      ) : null}

      {alreadyConfirmed && confirmedNotice ? (
        <p className={styles.confirmed}>{t.gift.confirmedNotice}</p>
      ) : (
        <>
          <hr className={styles.emailSeparator} />
          <div className={`${authFormStyles.field} ${styles.emailField}`}>
            <label className={authFormStyles.label} htmlFor={emailFieldId}>
              {t.gift.receiverEmailLabel}
              <RequiredMark />
            </label>
            <input
              id={emailFieldId}
              type="email"
              className={authFormStyles.input}
              value={receiverEmail}
              autoComplete="email"
              inputMode="email"
              required
              aria-required="true"
              disabled={busy}
              aria-invalid={receiverEmailError != null}
              aria-describedby={receiverEmailError ? emailErrorId : emailHintId}
              data-testid="gift-receiver-email"
              onChange={(event) => onReceiverEmailChange(event.target.value)}
            />
            {receiverEmailError ? (
              <p id={emailErrorId} className={authFormStyles.fieldError} role="alert">
                {receiverEmailError}
              </p>
            ) : (
              <p id={emailHintId} className={authFormStyles.hint}>
                {t.gift.receiverEmailHint}
              </p>
            )}
          </div>
          <Button
            type="button"
            className={styles.confirmButton}
            data-testid="gift-receiver-confirm"
            disabled={!canConfirm || busy}
            onClick={onConfirm}
          >
            {t.gift.confirmCta}
          </Button>
        </>
      )}

      <div className={cartStyles.trustNotes}>
        <p className={cartStyles.trustNote}>
          <HeartIcon />
          {t.cart.trustKitIncluded}
        </p>
      </div>
    </div>
  );
}

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 12.2s-4.6-2.7-4.6-6.1A2.7 2.7 0 0 1 7 3.6a2.7 2.7 0 0 1 4.6 2.5c0 3.4-4.6 6.1-4.6 6.1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
