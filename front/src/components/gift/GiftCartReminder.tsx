import { Children, type ReactNode } from 'react';
import { useLang } from '../../assets/i18n';
import { formatPrice } from '../../utils/formatPrice';
import type { CartGiftMeta } from '../../api/cart';
import type { GiftSummary } from '../../api/gift';
import { GiftCornerMark } from '../layout/GiftCornerMark';
import { formatGiftExpiryDate } from './shareCardExpiry';
import styles from './GiftCartReminder.module.css';

export function GiftCartReminder({
  summary,
  cartGift,
  statusLabel,
  lockNote,
  expiresAt,
  children,
}: {
  summary: GiftSummary | null;
  cartGift?: CartGiftMeta | null | undefined;
  statusLabel: string;
  lockNote?: string | null;
  /** Offer expiry (`clocks.offerExpiresAt`), printed with the status so the
   * giver sees the deadline the extend button moves. */
  expiresAt?: string | null;
  children?: ReactNode;
}) {
  const { t, lang } = useLang();
  const receiverName = summary?.receiverName?.trim() || cartGift?.receiverName?.trim() || '';
  const budget = summary?.maxBudget ?? cartGift?.maxBudget ?? null;
  const allowAccessories = summary?.allowAccessories ?? cartGift?.allowAccessories ?? false;
  const accessoryBudget = summary?.maxAccessoryBudget ?? cartGift?.maxAccessoryBudget ?? null;
  const giverComment = summary?.giverComment ?? '';
  const accessoryValue = !allowAccessories
    ? t.gift.reminderAccessoriesNone
    : accessoryBudget != null
      ? formatPrice(accessoryBudget)
      : t.gift.reminderAccessoriesYes;
  const actions = Children.toArray(children);
  const expiryDate = expiresAt ? new Date(expiresAt) : null;

  return (
    <div className={styles.block}>
      <GiftCornerMark />
      <div className={styles.meta}>
        {receiverName ? (
          <div>
            <p className={styles.label}>{t.gift.reminderWho}</p>
            <p className={styles.value}>{receiverName}</p>
          </div>
        ) : null}
        {budget != null ? (
          <div>
            <p className={styles.label}>{t.gift.reminderBudget}</p>
            <p className={styles.value}>{formatPrice(budget)}</p>
          </div>
        ) : null}
        <div>
          <p className={styles.label}>{t.gift.reminderAccessoryBudget}</p>
          <p className={styles.value}>{accessoryValue}</p>
        </div>
      </div>
      {giverComment ? (
        <div>
          <p className={styles.label}>{t.gift.recapMessageLabel}</p>
          <p className={`${styles.value} ${styles.message}`}>{giverComment}</p>
        </div>
      ) : null}
      <div className={styles.status}>
        <p className={styles.label}>{t.gift.reminderStatus}</p>
        <p className={styles.value} role="status">
          {statusLabel}
        </p>
        {expiryDate && !Number.isNaN(expiryDate.getTime()) ? (
          <p className={styles.expiry} data-testid="gift-offer-expires-at">
            {t.gift.reminderExpiresAt} {formatGiftExpiryDate(expiryDate, lang)}
          </p>
        ) : null}
        {lockNote ? <p className={styles.lockNote}>{lockNote}</p> : null}
      </div>
      {actions.length > 0 ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
