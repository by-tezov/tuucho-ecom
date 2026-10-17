import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import { useAuthSession } from '../state/AuthContext';
import { useCartCommands } from '../hooks/useCart';
import * as authApi from '../api/checkout';
import { getStripePromise } from '../config/stripeClient';
import { shopConfig } from '../config/env';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { withTimeout } from '../utils/withMinDuration';
import { clearEphemeralAddresses } from '../state/ephemeralAddresses';
import { clearEphemeralCards } from '../state/ephemeralCards';
import { clearGuestCheckoutAfterOrder } from '../state/guestCheckoutCompletion';
import { invalidateProductCache } from '../state/productCache';
import { invalidateCartBootstrapCache } from '../state/cartBootstrapCache';
import { formatPrice } from '../utils/formatPrice';
import { GiftOrderNote } from '../components/orders/GiftOrderNote';
import styles from './CartPage.module.css';

type PageStatus = 'checking' | 'succeeded' | 'failed';

/** Landing page for redirect-based payment methods only (some banks' 3DS
 * flows, PayPal, and Bancontact — genuinely off-site, unlike card/Apple Pay/
 * Google Pay which resolve in the cart's inline payment section via redirect:
 * 'if_required' and never reach this route at all). Reachable signed out:
 * guest checkout has no session, so this must never be RequireAuth-gated
 * (see App.tsx) — a guest paying by PayPal or Bancontact lands here exactly
 * like an authenticated one. */
export function CheckoutReturnPage() {
  const { t, lang } = useLang();
  const { status, authedRequest } = useAuthSession();
  const { refreshCart } = useCartCommands();
  const [searchParams] = useSearchParams();
  const [pageStatus, setPageStatus] = useState<PageStatus>('checking');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [loyaltyEarn, setLoyaltyEarn] = useState<number | null>(null);
  const [giftReceiverName, setGiftReceiverName] = useState<string | null>(null);

  useEffect(() => {
    // Auth resolves asynchronously on a fresh load (exactly what this route
    // always is, redirected here by Stripe) — status briefly reads 'loading'
    // before settling to 'anonymous'/'authenticated'. Finalizing against
    // that transient value would wrongly take the authenticated path for a
    // genuine guest and 401. Nothing else here depends on status, so this
    // effect just waits it out.
    if (status === 'loading') return;

    let cancelled = false;
    const clientSecret = searchParams.get('payment_intent_client_secret');
    if (!clientSecret) {
      setPageStatus('failed');
      return;
    }
    (async () => {
      const stripe = await withTimeout(getStripePromise(), shopConfig.paymentTimeoutMs);
      if (!stripe) {
        if (!cancelled) setPageStatus('failed');
        return;
      }
      const { paymentIntent } = await withTimeout(
        stripe.retrievePaymentIntent(clientSecret),
        shopConfig.paymentTimeoutMs,
      );
      if (cancelled) return;
      if (
        !paymentIntent ||
        (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'requires_capture')
      ) {
        setPageStatus('failed');
        return;
      }
      try {
        const { order } = await withTimeout(
          status === 'anonymous'
            ? authApi.finalizeGuestCheckout(paymentIntent.id)
            : authedRequest((token) => authApi.finalizeCheckout(token, paymentIntent.id)),
          shopConfig.paymentTimeoutMs,
        );
        if (cancelled) return;
        setOrderNumber(order.orderNumber);
        setLoyaltyEarn((order.loyaltyEarn ?? 0) > 0 ? order.loyaltyEarn! : null);
        setGiftReceiverName(order.gift?.receiverName?.trim() || null);
        setPageStatus('succeeded');
        clearEphemeralAddresses();
        clearEphemeralCards();
        // This customer just consumed stock, so cached availability is known
        // to be wrong rather than merely aging — don't wait out the TTL.
        invalidateProductCache('order');
        invalidateCartBootstrapCache('order');
        // A guest's cart lives only in localStorage (see guestCart.ts) — the
        // order that just succeeded is what matters from here, not the
        // selection that led to it, so it shouldn't still be sitting in
        // /cart as if nothing happened.
        if (status === 'anonymous') {
          void clearGuestCheckoutAfterOrder();
        }
        refreshCart();
      } catch {
        if (!cancelled) setPageStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, refreshCart, searchParams, status]);

  return (
    <section aria-labelledby="checkout-return-h" className={styles.section}>
      <Seo
        title={t.cart.paymentModalTitle}
        description={t.cart.paymentModalTitle}
        path="/checkout/return"
        noindex
      />

      {pageStatus === 'checking' && (
        <p className={styles.title} id="checkout-return-h">
          {t.cart.payingButton}
        </p>
      )}

      {pageStatus === 'succeeded' && orderNumber && (
        <div className={styles.successCard} data-testid="cart-order-success">
          <h1 id="checkout-return-h" className={styles.title}>
            {t.cart.confirmSuccessTitle}
          </h1>
          <p className={styles.successOrderNumber} data-testid="cart-order-number">
            {orderNumber}
          </p>
          <p>{t.cart.confirmSuccessText}</p>
          {loyaltyEarn != null && loyaltyEarn > 0 && (
            <p className={styles.loyaltyEarnCallout} role="note">
              {t.loyalty.successEarnPrefix}{' '}
              <strong className={styles.loyaltyEarnAmount}>{formatPrice(loyaltyEarn)}</strong>{' '}
              {t.loyalty.successEarnSuffix}
            </p>
          )}
          {giftReceiverName ? <GiftOrderNote name={giftReceiverName} className={styles.giftNote} /> : null}
          <div className={styles.buttonRow}>
            {/* Guest orders are never attached to an account (see the guest
                checkout design — order.user_id stays null), so there is
                nothing for /orders, which is RequireAuth-gated anyway, to
                show a guest. */}
            {status === 'authenticated' && (
              <Button to={localizedPath('/orders', lang)}>{t.cart.viewOrdersButton}</Button>
            )}
            <Button variant="ghost" to={localizedPath('/gallery', lang)}>
              {t.cart.continueShoppingButton}
            </Button>
          </div>
        </div>
      )}

      {pageStatus === 'failed' && (
        <div className={styles.successCard}>
          <h1 id="checkout-return-h" className={styles.title}>
            {t.cart.paymentErrorGeneric}
          </h1>
          <div className={styles.buttonRow}>
            <Link to={localizedPath('/cart', lang)} className={styles.emptyLink}>
              {t.cart.pageTitle}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
