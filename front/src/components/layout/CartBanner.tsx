import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useCartData } from '../../hooks/useCart';
import { useAuthSession } from '../../state/AuthContext';
import { useSplashEntryActive } from '../../state/splashEntryGate';
import { formatPrice } from '../../utils/formatPrice';
import styles from './CartBanner.module.css';

/** Checkout reminder below the header while the cart has items. Hidden on the
 * cart page itself, where the customer is already finalising the order, and
 * during the `/` entry splash so it does not sit on top of the intro. */
export function CartBanner() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const { items, cartCount } = useCartData();
  const { status, authedRequest } = useAuthSession();
  const splashBlocking = useSplashEntryActive();
  const [loyaltyEarn, setLoyaltyEarn] = useState(0);

  const cartFingerprint = useMemo(
    () =>
      items
        .filter((item) => item.origin !== 'rule')
        .map(
          (item) =>
            `${item.productId}:${item.shapeKey}:${item.lengthKey}:${item.size}:${item.packKey ?? ''}:${item.quantity}`,
        )
        .sort()
        .join('|'),
    [items],
  );

  useEffect(() => {
    if (cartCount === 0 || !cartFingerprint) {
      setLoyaltyEarn(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // Loaded on first use: the banner only calls it once the cart holds
        // something, so the loyalty client stays off the entry bundle.
        const loyaltyApi = await import('../../api/loyalty');
        if (status === 'authenticated') {
          const result = await authedRequest((token) =>
            loyaltyApi.getLoyaltyCheckoutPreview(token, { applyLoyalty: true }),
          );
          if (!cancelled) {
            setLoyaltyEarn(
              result.preview.enabled && result.preview.loyaltyEarn > 0 ? result.preview.loyaltyEarn : 0,
            );
          }
          return;
        }
        if (status === 'anonymous') {
          const guestItems = items
            .filter((item) => item.origin !== 'rule' && item.locked !== true)
            .map((item) => ({
              productId: item.productId,
              shapeKey: item.shapeKey,
              lengthKey: item.lengthKey,
              size: item.size,
              packKey: item.packKey ?? '',
              quantity: item.quantity,
            }));
          if (guestItems.length === 0) {
            if (!cancelled) setLoyaltyEarn(0);
            return;
          }
          const result = await loyaltyApi.getGuestLoyaltyCheckoutPreview({ items: guestItems });
          if (!cancelled) {
            setLoyaltyEarn(
              result.preview.enabled && result.preview.loyaltyEarn > 0 ? result.preview.loyaltyEarn : 0,
            );
          }
        }
      } catch {
        if (!cancelled) setLoyaltyEarn(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartCount, cartFingerprint, status, authedRequest, items]);

  if (splashBlocking || cartCount === 0 || location.pathname === localizedPath('/cart', lang)) return null;

  return (
    <div className={styles.banner}>
      {/* The status is the message alone, not the button beside it. */}
      <span className={styles.message} role="status">
        <span className={styles.reminderIcon} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6.6a4 4 0 0 1 8 0c0 4.1 1.5 4.3 1.5 5.1H2.5C2.5 10.9 4 10.7 4 6.6Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.2 13.3a1.9 1.9 0 0 0 3.6 0"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className={styles.messageText}>
          {t.cart.bannerText}
          {loyaltyEarn > 0 ? (
            <>
              {' '}
              {t.cart.bannerEarnPrefix}{' '}
              <strong className={styles.earnAmount}>{formatPrice(loyaltyEarn)}</strong>{' '}
              {t.cart.bannerEarnSuffix}
            </>
          ) : null}
        </span>
      </span>
      <button type="button" className={styles.cta} onClick={() => navigate(localizedPath('/cart', lang))}>
        {t.cart.bannerCta} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
