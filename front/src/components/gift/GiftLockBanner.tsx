import { useLang } from '../../assets/i18n';
import { useGiftLock } from '../../hooks/useGiftLock';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import styles from './GiftLockBanner.module.css';

export function GiftLockBanner() {
  const { t } = useLang();
  const { shopLocked } = useGiftLock();
  const gift = useOptionalGiftReceiver();
  if (!shopLocked) return null;

  const name = gift.summary?.giverDisplayName;
  const remainingBudget = gift.canMutate ? gift.summary?.remaining.remainingBudget : null;
  const remainingAccessoryBudget = gift.canMutate ? gift.summary?.remaining.remainingAccessoryBudget : null;
  const showBudget =
    gift.summary != null && gift.summary.hideReceiverPrices !== true && remainingBudget != null;
  const showAccessoryBudget =
    gift.summary != null &&
    gift.summary.hideReceiverPrices !== true &&
    remainingAccessoryBudget != null &&
    (gift.summary.allowAccessories === true || remainingAccessoryBudget > 0);

  return (
    <div className={styles.banner} role="status" data-testid="gift-lock-banner">
      <p className={styles.lead}>{name ? t.gift.bannerFrom.replace('{name}', name) : t.gift.lockedBanner}</p>
      {showBudget ? (
        <p className={styles.meta} data-testid="gift-remaining-budget">
          {t.gift.remainingBudget.replace('{n}', String(remainingBudget))}
        </p>
      ) : null}
      {showAccessoryBudget ? (
        <p className={styles.meta} data-testid="gift-remaining-accessory-budget">
          {t.gift.remainingAccessoryBudget.replace('{n}', String(remainingAccessoryBudget))}
        </p>
      ) : null}
    </div>
  );
}
