import { useNavigate } from 'react-router-dom';
import { localizedPath } from '../../config/i18nRoutes';
import { Seo } from '../../components/seo/Seo';
import { Button } from '../../components/ui/Button';
import { GiftOrderNote } from '../../components/orders/GiftOrderNote';
import { formatPrice } from '../../utils/formatPrice';
import type { useLang } from '../../assets/i18n';
import type { Lang } from '../../assets/i18n/types';
import cartFeatureStyles from '../../components/cart/CartFeature.module.css';
import pageStyles from '../CartPage.module.css';

const styles = { ...pageStyles, ...cartFeatureStyles };

type T = ReturnType<typeof useLang>['t'];

export function ShopCartOrderSuccess(props: {
  t: T;
  lang: Lang;
  status: string;
  pageTitle: string;
  confirmedOrderNumber: string;
  confirmedLoyaltyEarn: number | null;
  confirmedGiftReceiverName: string | null;
}) {
  const {
    t,
    lang,
    status,
    pageTitle,
    confirmedOrderNumber,
    confirmedLoyaltyEarn,
    confirmedGiftReceiverName,
  } = props;
  const navigate = useNavigate();

  return (
    <section aria-labelledby="cart-h" className={styles.section}>
      <Seo title={pageTitle} description={pageTitle} path="/cart" noindex />
      <div className={styles.successCard} data-testid="cart-order-success">
        <h1 id="cart-h" className={styles.title}>
          {t.cart.confirmSuccessTitle}
        </h1>
        <p className={styles.successOrderNumber} data-testid="cart-order-number">
          {confirmedOrderNumber}
        </p>
        <p>{t.cart.confirmSuccessText}</p>
        {confirmedLoyaltyEarn != null && confirmedLoyaltyEarn > 0 && (
          <p className={styles.loyaltyEarnCallout} role="note">
            {t.loyalty.successEarnPrefix}{' '}
            <strong className={styles.loyaltyEarnAmount}>{formatPrice(confirmedLoyaltyEarn)}</strong>{' '}
            {t.loyalty.successEarnSuffix}
          </p>
        )}
        {confirmedGiftReceiverName ? (
          <GiftOrderNote name={confirmedGiftReceiverName} className={styles.giftNote} />
        ) : null}
        <div className={styles.buttonRow}>
          {/* Guest orders are never attached to an account (order.user_id
              stays null), so there is nothing for /orders, which is
              RequireAuth-gated anyway, to show a guest. */}
          {status === 'authenticated' && (
            <Button type="button" onClick={() => navigate(localizedPath('/orders', lang))}>
              {t.cart.viewOrdersButton}
            </Button>
          )}
          <Button variant="ghost" type="button" onClick={() => navigate(localizedPath('/gallery', lang))}>
            {t.cart.continueShoppingButton}
          </Button>
        </div>
      </div>
    </section>
  );
}
