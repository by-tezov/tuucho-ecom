import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type Courier } from '../../api/account';
import * as authApi from '../../api/checkout';
import type { CheckoutVoucher, GuestCheckoutAddress, GuestCheckoutLine } from '../../api/checkout';
import * as loyaltyApi from '../../api/loyalty';
import { type LoyaltyCheckoutPreview } from '../../api/loyalty';
import { isBackendUnavailableError } from '../../api/http';
import { ApiError } from '../../api/errors';
import { type CheckoutFormState } from '../../components/cart/CartCheckoutSection';
import { type CartPromoStatus } from '../../components/cart/CartOrderSummary';
import { courierDeliveryTime } from '../../utils/courierDeliveryTime';
import { pickCourierTier, resolvePacketPrice } from '../../utils/courierPricing';
import { roundPrice } from '../../utils/formatPrice';
import { previewFreeShipping, previewNailQtyTier, type PublicCartRule } from '../../utils/cartRulesPreview';
import { saveGuestState } from '../../state/guestCart';
import type { useLang } from '../../assets/i18n';
import { usePluginEnabled } from '../../plugins/StorefrontBootstrap';

type T = ReturnType<typeof useLang>['t'];
type AuthedRequest = <R>(fn: (token: string) => Promise<R>) => Promise<R>;

/** Shipping totals, loyalty quotes, promo validation, and checkout readiness. */
export function useShopCartPricing(args: {
  t: T;
  status: string;
  authedRequest: AuthedRequest;
  cartRules: PublicCartRule[];
  subtotal: number;
  /** Catalogue nail sets. Composed sets are passed separately. */
  tierTotals: { qty: number; subtotal: number };
  tierCompositions: ReadonlyArray<{ quantity: number; nailCount: number; lineTotal: number }>;
  nailQty: number;
  totalQuantity: number;
  cartFingerprint: string;
  giftLinesLength: number;
  hasPurchasableItems: boolean;
  selectedCourier: Courier | undefined;
  shippingCountryCode: string | null | undefined;
  courierList: Courier[];
  courierCode: string | null;
  express: boolean;
  addressId: string | null;
  addressNotice: boolean;
  sameAsBilling: boolean;
  billingAddressId: string | null;
  checkoutFormState: CheckoutFormState;
  confirmedOrderNumber: string | null;
  promoCode: string;
  setPromoCode: Dispatch<SetStateAction<string>>;
  appliedVoucher: CheckoutVoucher | null;
  setAppliedVoucher: Dispatch<SetStateAction<CheckoutVoucher | null>>;
  applyLoyalty: boolean;
  setApplyLoyalty: Dispatch<SetStateAction<boolean>>;
  guestAddressInput: (id: string | null) => GuestCheckoutAddress | undefined;
  guestCheckoutItems: () => GuestCheckoutLine[];
  guestLoyaltyPreviewRequest: () => { items: GuestCheckoutLine[]; voucherCode?: string } | undefined;
}) {
  const {
    t,
    status,
    authedRequest,
    cartRules,
    subtotal,
    tierTotals,
    tierCompositions,
    nailQty,
    totalQuantity,
    cartFingerprint,
    giftLinesLength,
    hasPurchasableItems,
    selectedCourier,
    shippingCountryCode,
    courierList,
    courierCode,
    express,
    addressId,
    addressNotice,
    sameAsBilling,
    billingAddressId,
    checkoutFormState,
    confirmedOrderNumber,
    promoCode,
    setPromoCode,
    appliedVoucher,
    setAppliedVoucher,
    applyLoyalty,
    setApplyLoyalty,
    guestAddressInput,
    guestCheckoutItems,
    guestLoyaltyPreviewRequest,
  } = args;

  const [promoStatus, setPromoStatus] = useState<CartPromoStatus | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const appliedVoucherRef = useRef<CheckoutVoucher | null>(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState<LoyaltyCheckoutPreview | null>(null);
  const [loyaltyWalletAvailable, setLoyaltyWalletAvailable] = useState(0);
  const loyaltyOn = usePluginEnabled('commerce-loyalty');

  const selectedDeliveryTime = selectedCourier
    ? courierDeliveryTime(selectedCourier, shippingCountryCode)
    : undefined;
  const deliveryEstimateLine = selectedDeliveryTime
    ? (selectedDeliveryTime.minDays === selectedDeliveryTime.maxDays
        ? t.cart.courierDeliveryDaysSingle
        : t.cart.courierDeliveryDays
      )
        .replace('{min}', String(selectedDeliveryTime.minDays))
        .replace('{max}', String(selectedDeliveryTime.maxDays))
    : null;
  const custodyEstimateLine =
    selectedDeliveryTime?.custodyDays != null
      ? t.cart.courierCustodyDays.replace('{days}', String(selectedDeliveryTime.custodyDays))
      : null;
  // An empty cart or accessories-only cart (nail quantity 0) still fits the
  // first parcel tier: `pickCourierTier` uses `maxQuantity >= totalQuantity`.
  // Stock availability is handled on each cart line and again by the API when
  // reserving checkout stock; it must not make every delivery method look
  // unavailable.
  const selectedTier = selectedCourier ? pickCourierTier(selectedCourier, totalQuantity) : undefined;
  const shippingListFee = selectedTier
    ? resolvePacketPrice(
        express && selectedTier.expressPrice != null ? selectedTier.expressPrice : selectedTier.price,
        shippingCountryCode,
      )
    : null;
  const nailQtyTier = previewNailQtyTier(cartRules, tierTotals.qty, tierTotals.subtotal, tierCompositions);
  const showRulesBlock = giftLinesLength > 0 || (nailQtyTier != null && nailQtyTier.nailQty > 0);
  const rulesItemDiscount = nailQtyTier?.discount ?? 0;
  // Franco base = sous-total after volume remise; courier fee is never included.
  const francoMerchandise = subtotal - rulesItemDiscount;
  const freeShipping = previewFreeShipping(
    cartRules,
    shippingCountryCode,
    francoMerchandise,
    shippingListFee ?? undefined,
  );
  const shippingFee = shippingListFee == null ? undefined : freeShipping?.applied ? 0 : shippingListFee;
  const loyaltyCredit =
    loyaltyOn && status === 'authenticated' && applyLoyalty && (loyaltyPreview?.loyaltyCredit ?? 0) > 0
      ? loyaltyPreview!.loyaltyCredit
      : 0;
  const loyaltyAvailable =
    typeof loyaltyPreview?.availableBalance === 'number'
      ? loyaltyPreview.availableBalance
      : loyaltyWalletAvailable;
  // Spend block only when there is something to spend (or already applied).
  const showLoyaltyWallet =
    loyaltyOn && status === 'authenticated' && (loyaltyAvailable > 0 || loyaltyCredit > 0);
  const grandTotal = roundPrice(
    subtotal + (shippingFee ?? 0) - rulesItemDiscount - (appliedVoucher?.discount ?? 0) - loyaltyCredit,
  );
  const promoPending = promoCode.trim().length > 0 && !appliedVoucher;
  const canValidatePromo =
    promoPending && !validatingPromo && !!addressId && !!courierCode && shippingFee !== undefined;
  const checkoutFormIncomplete =
    !addressId || !courierCode || shippingFee === undefined || (!sameAsBilling && !billingAddressId);
  // A fully voucher-covered checkout skips payment method/Stripe entirely
  // (see onCompleteFreeOrder). Purely a client-side total check, no
  // server round-trip needed to know this.
  const isFreeOrder = !checkoutFormIncomplete && !promoPending && grandTotal <= 0;
  // Keep the recap's readiness cue aligned with the actual Payer button:
  // every checkout detail, authentication, and payment choice must be valid.
  const summaryReadyForPayment = !checkoutFormIncomplete && !promoPending && checkoutFormState.canSubmit;

  // Wallet spend UI needs the balance even before delivery is chosen.
  useEffect(() => {
    if (!loyaltyOn || status !== 'authenticated') {
      setLoyaltyWalletAvailable(0);
      return;
    }
    let cancelled = false;
    void authedRequest((token) => loyaltyApi.getLoyaltyWallet(token))
      .then((result) => {
        if (cancelled) return;
        setLoyaltyWalletAvailable(result.wallet.enabled ? result.wallet.available : 0);
      })
      .catch(() => {
        if (!cancelled) setLoyaltyWalletAvailable(0);
      });
    return () => {
      cancelled = true;
    };
  }, [loyaltyOn, status, authedRequest, confirmedOrderNumber]);

  useEffect(() => {
    const canQuoteAuthenticated = loyaltyOn && status === 'authenticated' && subtotal > 0;
    const guestQuote = loyaltyOn && status === 'anonymous' ? guestLoyaltyPreviewRequest() : undefined;
    if (!canQuoteAuthenticated && !guestQuote) {
      setLoyaltyPreview(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (canQuoteAuthenticated) {
          const result = await authedRequest((token) =>
            loyaltyApi.getLoyaltyCheckoutPreview(token, {
              applyLoyalty,
              voucherCode: appliedVoucher?.code ?? null,
            }),
          );
          if (!cancelled) setLoyaltyPreview(result.preview.enabled ? result.preview : null);
          return;
        }
        if (guestQuote) {
          const result = await loyaltyApi.getGuestLoyaltyCheckoutPreview({
            items: guestQuote.items,
            ...(guestQuote.voucherCode ? { voucherCode: guestQuote.voucherCode } : {}),
          });
          if (!cancelled) setLoyaltyPreview(result.preview.enabled ? result.preview : null);
        }
      } catch {
        if (!cancelled) setLoyaltyPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    loyaltyOn,
    status,
    applyLoyalty,
    appliedVoucher?.code,
    authedRequest,
    guestLoyaltyPreviewRequest,
    subtotal,
    rulesItemDiscount,
    cartFingerprint,
    totalQuantity,
    nailQty,
  ]);

  // Since delivery methods are no longer restricted by the selected address,
  // an overflow is simply a cart that no courier can carry.
  const noCourierFits =
    courierList.length > 0 && courierList.every((courier) => !pickCourierTier(courier, totalQuantity));

  // Each block below surfaces only the guidance an action there would fix.
  // Replaces the old single "below total" notice, which lumped address/
  // courier/payment guidance into one message shown inside the Paiement
  // section regardless of which block the fix actually lived in.
  const addressBlockNotice = !hasPurchasableItems
    ? null
    : addressNotice
      ? t.cart.addressDeselectedNotice
      : !addressId
        ? t.cart.errorAddressRequired
        : null;
  // Mandatory only once the checkbox is unchecked. Checked means "use the
  // delivery address for billing too", which needs no selection at all.
  const billingBlockNotice =
    hasPurchasableItems && !sameAsBilling && !billingAddressId ? t.cart.errorBillingAddressRequired : null;
  const courierBlockNotice =
    !hasPurchasableItems || noCourierFits || courierCode ? null : t.cart.errorCourierRequired;
  // Purely payment/Stripe-level now. checkoutFormState.error only ever
  // comes from an actual submit attempt (free-order completion or a card/
  // PayPal confirmation failure), never from address/courier selection.
  const paymentNotice = checkoutFormState.error;

  // A voucher is explicitly confirmed against the current cart. A delivery
  // or quantity change invalidates that confirmation, and therefore also
  // prevents a payment intent from being opened until the customer checks it
  // again.
  useEffect(() => {
    appliedVoucherRef.current = appliedVoucher;
  }, [appliedVoucher]);

  useEffect(() => {
    if (!appliedVoucherRef.current) return;
    setAppliedVoucher(null);
    setPromoStatus(null);
  }, [addressId, courierCode, express, subtotal, shippingFee, setAppliedVoucher]);

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) return;
    if (!addressId) {
      setPromoStatus({ tone: 'error', text: t.cart.errorAddressRequired });
      return;
    }
    if (!courierCode || shippingFee === undefined) {
      setPromoStatus({ tone: 'error', text: t.cart.errorCourierRequired });
      return;
    }
    if (!sameAsBilling && !billingAddressId) {
      setPromoStatus({ tone: 'error', text: t.cart.errorBillingAddressRequired });
      return;
    }
    // A guest voucher restricted to specific allowed_user_ids can never
    // resolve (no persisted identity to check). The server reports that
    // exactly like it would for an unlisted authenticated customer, via
    // promoCodeUserNotAllowed below.
    const guestAddress = status === 'anonymous' ? guestAddressInput(addressId) : undefined;
    const guestBillingAddress =
      status === 'anonymous' && !sameAsBilling ? guestAddressInput(billingAddressId) : undefined;
    if (status === 'anonymous' && (!guestAddress || (!sameAsBilling && !guestBillingAddress))) {
      setPromoStatus({ tone: 'error', text: t.cart.errorAddressRequired });
      return;
    }
    setValidatingPromo(true);
    setPromoStatus(null);
    try {
      const result =
        status === 'anonymous'
          ? await authApi.validateGuestCheckoutVoucher(
              guestCheckoutItems(),
              guestAddress!,
              courierCode,
              express,
              code,
              guestBillingAddress,
            )
          : await authedRequest((token) =>
              authApi.validateCheckoutVoucher(
                token,
                addressId,
                courierCode,
                express,
                code,
                sameAsBilling ? undefined : (billingAddressId ?? undefined),
              ),
            );
      setAppliedVoucher(result.voucher);
      setPromoCode(result.voucher.code);
      setApplyLoyalty(false);
      if (status === 'anonymous') saveGuestState({ voucherCode: result.voucher.code });
      setPromoStatus({ tone: 'success', text: result.voucher.description ?? t.cart.promoCodeApplied });
    } catch (error) {
      if (isBackendUnavailableError(error)) return;
      setAppliedVoucher(null);
      const message =
        error instanceof ApiError
          ? error.code === 'voucher_not_found' ||
            error.code === 'voucher_invalid' ||
            error.code === 'voucher_disabled'
            ? t.cart.promoCodeNotFound
            : error.code === 'voucher_not_started'
              ? t.cart.promoCodeNotStarted
              : error.code === 'voucher_expired'
                ? t.cart.promoCodeExpired
                : error.code === 'voucher_depleted'
                  ? t.cart.promoCodeDepleted
                  : error.code === 'voucher_user_not_allowed'
                    ? t.cart.promoCodeUserNotAllowed
                    : error.code === 'voucher_conditions_not_met'
                      ? t.cart.promoCodeConditionsNotMet
                      : t.cart.promoCodeInvalid
          : t.cart.promoCodeInvalid;
      setPromoStatus({ tone: 'error', text: message });
    } finally {
      setValidatingPromo(false);
    }
  }

  function handleApplyLoyaltyChange(next: boolean) {
    setApplyLoyalty(next);
    if (next) {
      setAppliedVoucher(null);
      setPromoCode('');
      setPromoStatus(null);
      if (status === 'anonymous') saveGuestState({ voucherCode: null });
    }
  }

  function clearPromoAfterGuestOrder() {
    setPromoCode('');
    setAppliedVoucher(null);
    appliedVoucherRef.current = null;
    setPromoStatus(null);
  }

  return {
    promoStatus,
    setPromoStatus,
    validatingPromo,
    loyaltyPreview,
    deliveryEstimateLine,
    custodyEstimateLine,
    selectedTier,
    shippingListFee,
    nailQtyTier,
    showRulesBlock,
    rulesItemDiscount,
    francoMerchandise,
    freeShipping,
    shippingFee,
    loyaltyCredit,
    loyaltyAvailable,
    showLoyaltyWallet,
    grandTotal,
    promoPending,
    canValidatePromo,
    checkoutFormIncomplete,
    isFreeOrder,
    summaryReadyForPayment,
    noCourierFits,
    addressBlockNotice,
    billingBlockNotice,
    courierBlockNotice,
    paymentNotice,
    applyPromoCode,
    handleApplyLoyaltyChange,
    clearPromoAfterGuestOrder,
  };
}
