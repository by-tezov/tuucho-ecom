import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { invalidateProductCache } from '../../state/productCache';
import { invalidateCartBootstrapCache } from '../../state/cartBootstrapCache';
import { clearGuestCheckoutDraft } from '../../state/guestCheckoutDraft';
import { type CheckoutFormState } from '../../components/cart/CartCheckoutSection';
import { useCartCheckoutActions } from '../../components/checkout/useCartCheckoutActions';
import { type Address } from '../../api/account';
import { type CartItem } from '../../api/cart';
import { type CheckoutVoucher } from '../../api/checkout';
import type { GiftSummary } from '../../api/gift';
import type { AuthSessionContextValue, AuthStatus } from '../../state/AuthContext';
import type { Lang } from '../../assets/i18n/types';
import type { LoyaltyCheckoutPreview } from '../../api/loyalty';

type AuthedRequest = AuthSessionContextValue['authedRequest'];

/** Payment intents, form readiness, and confirmed-order scroll. */
export function useShopCartCheckout(args: {
  status: AuthStatus;
  authedRequest: AuthedRequest;
  items: CartItem[];
  guestExtra?: unknown;
  addresses: Address[];
  addressId: string | null;
  billingAddressId: string | null;
  sameAsBilling: boolean;
  courierCode: string | null;
  express: boolean;
  appliedVoucher: CheckoutVoucher | null;
  applyLoyalty: boolean;
  guestEmail: string;
  guestConsent: boolean;
  lang: Lang;
}) {
  const {
    status,
    authedRequest,
    items,
    guestExtra,
    addresses,
    addressId,
    billingAddressId,
    sameAsBilling,
    courierCode,
    express,
    appliedVoucher,
    applyLoyalty,
    guestEmail,
    guestConsent,
    lang,
  } = args;

  const [checkoutFormState, setCheckoutFormState] = useState<CheckoutFormState>({
    canSubmit: false,
    submitting: false,
    error: null,
  });
  const handleCheckoutStateChange = useCallback(
    (state: CheckoutFormState) => setCheckoutFormState(state),
    [],
  );
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [confirmedLoyaltyEarn, setConfirmedLoyaltyEarn] = useState<number | null>(null);
  const [confirmedGiftReceiverName, setConfirmedGiftReceiverName] = useState<string | null>(null);

  const {
    guestEmailValid,
    guestAddressInput,
    guestCheckoutItems,
    guestLoyaltyPreviewRequest,
    createPayPalIntent,
    createBancontactIntent,
    createWalletIntent,
    createCardIntent,
    createNewCardIntent,
    completeFreeOrder,
  } = useCartCheckoutActions({
    status,
    authedRequest,
    items,
    extra: guestExtra,
    addresses,
    addressId,
    billingAddressId,
    sameAsBilling,
    courierCode,
    express,
    appliedVoucherCode: appliedVoucher?.code,
    applyLoyalty,
    guestEmail,
    guestConsent,
    lang,
  });

  const confirmScrollRafRef = useRef<number | null>(null);
  // Success replaces the cart UI in place (same /cart URL), so Layout's
  // route ScrollToTop does not run. Jump to the top of "Commande confirmée"
  // ourselves. Deferred two frames rather than called synchronously: the
  // payment confirm dialogs that lead here (CartCheckoutSection) don't reset
  // their own submitting/LoadingModal state on the success path before
  // calling onSuccess (only their error paths do), so their LoadingModal
  // and the body scroll lock it holds via useLockBodyScroll can still be
  // mid-teardown on this same render. A synchronous scrollTo here can race
  // that, especially on mobile Safari, which is unreliable about honoring a
  // programmatic scroll while overflow is still hidden on <html>/<body>.
  // Waiting two rAFs pushes this past that unmount's own paint.
  useEffect(() => {
    if (!confirmedOrderNumber) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        // Instant jump. Never inherit a smooth slide from the previous page.
        window.scrollTo({ top: 0, behavior: 'auto' });
      });
      confirmScrollRafRef.current = raf2;
    });
    confirmScrollRafRef.current = raf1;
    return () => {
      if (confirmScrollRafRef.current !== null) cancelAnimationFrame(confirmScrollRafRef.current);
    };
  }, [confirmedOrderNumber]);

  return {
    checkoutFormState,
    handleCheckoutStateChange,
    confirmedOrderNumber,
    setConfirmedOrderNumber,
    confirmedLoyaltyEarn,
    setConfirmedLoyaltyEarn,
    confirmedGiftReceiverName,
    setConfirmedGiftReceiverName,
    guestEmailValid,
    guestAddressInput,
    guestCheckoutItems,
    guestLoyaltyPreviewRequest,
    createPayPalIntent,
    createBancontactIntent,
    createWalletIntent,
    createCardIntent,
    createNewCardIntent,
    completeFreeOrder,
  };
}

/** Clears local checkout leftovers after a successful payment. */
export function finalizeShopCartPaymentSuccess(args: {
  status: AuthStatus;
  orderNumber: string;
  loyaltyEarn?: number | null;
  loyaltyPreview: LoyaltyCheckoutPreview | null;
  isGiftCart: boolean;
  giftSummary: GiftSummary | null;
  giftReceiverName: string | null | undefined;
  refreshCarts: () => Promise<unknown> | void;
  refreshOrders: () => void;
  resetDeliveryAfterGuestOrder: () => void;
  pruneOneTimeAddressesAfterOrder: () => void;
  clearPromoAfterGuestOrder: () => void;
  setPaymentMethodId: Dispatch<SetStateAction<string | null>>;
  setGuestEmail: Dispatch<SetStateAction<string>>;
  setGuestConsent: Dispatch<SetStateAction<boolean>>;
  setConfirmedLoyaltyEarn: Dispatch<SetStateAction<number | null>>;
  setConfirmedGiftReceiverName: Dispatch<SetStateAction<string | null>>;
  setConfirmedOrderNumber: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    status,
    orderNumber,
    loyaltyEarn,
    loyaltyPreview,
    isGiftCart,
    giftSummary,
    giftReceiverName,
    refreshCarts,
    refreshOrders,
    resetDeliveryAfterGuestOrder,
    pruneOneTimeAddressesAfterOrder,
    clearPromoAfterGuestOrder,
    setPaymentMethodId,
    setGuestEmail,
    setGuestConsent,
    setConfirmedLoyaltyEarn,
    setConfirmedGiftReceiverName,
    setConfirmedOrderNumber,
  } = args;

  // A completed guest checkout drops every local address choice. An
  // account keeps remembered addresses, but its one-time choices belong
  // only to the completed order/sticker.
  if (status === 'anonymous') {
    resetDeliveryAfterGuestOrder();
    setPaymentMethodId(null);
    clearPromoAfterGuestOrder();
  } else {
    pruneOneTimeAddressesAfterOrder();
  }
  // Guest email + CGV checkbox live in sessionStorage for terms/privacy
  // detours. Drop them with the completed order so a later cart does not
  // reopen pre-filled (CartCheckoutSection / CheckoutReturnPage also clear).
  clearGuestCheckoutDraft();
  setGuestEmail('');
  setGuestConsent(false);
  const earnFromOrder = loyaltyEarn != null && loyaltyEarn > 0 ? loyaltyEarn : null;
  const earnFromPreview =
    loyaltyPreview && loyaltyPreview.loyaltyEarn > 0 ? loyaltyPreview.loyaltyEarn : null;
  setConfirmedLoyaltyEarn(earnFromOrder ?? earnFromPreview);
  const giftName = isGiftCart ? giftSummary?.receiverName?.trim() || giftReceiverName?.trim() || null : null;
  setConfirmedGiftReceiverName(giftName);
  setConfirmedOrderNumber(orderNumber);
  // This customer just consumed stock, so cached availability is known to
  // be wrong rather than merely aging. Don't wait out the TTL.
  invalidateProductCache('order');
  invalidateCartBootstrapCache('order');
  // Plural, not refreshCart(): a successful order that emptied the active
  // cart deletes it server-side and reactivates another one (see
  // confirmOrder in orders.service.ts). refreshCart() alone only
  // refetches items for whichever cart the client still thinks is active,
  // leaving the (now gone) cart's stale entry in the switcher/list.
  void refreshCarts();
  refreshOrders();
}
