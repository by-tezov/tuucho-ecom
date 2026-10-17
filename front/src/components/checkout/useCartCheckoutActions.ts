import { useCallback } from 'react';
import type { Address } from '../../api/account';
import type { CartItem } from '../../api/cart';
import * as checkoutApi from '../../api/checkout';
import type { Lang } from '../../assets/i18n/types';
import type { AuthSessionContextValue, AuthStatus } from '../../state/AuthContext';
import { loadGuestCards } from '../../state/guestCardVault';
import { cardComment } from '../../utils/cartComment';

const GUEST_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INCOMPLETE_DELIVERY_ERROR = 'Delivery details are incomplete.';

interface UseCartCheckoutActionsOptions {
  status: AuthStatus;
  authedRequest: AuthSessionContextValue['authedRequest'];
  items: CartItem[];
  compositions?: import('../../api/cart').GuestImportComposition[];
  addresses: Address[];
  addressId: string | null;
  billingAddressId: string | null;
  sameAsBilling: boolean;
  courierCode: string | null;
  express: boolean;
  appliedVoucherCode: string | undefined;
  applyLoyalty: boolean;
  guestEmail: string;
  guestConsent: boolean;
  lang: Lang;
}

/** Builds guest payloads and stable payment-intent actions away from page composition. */
export function useCartCheckoutActions({
  status,
  authedRequest,
  items,
  compositions = [],
  addresses,
  addressId,
  billingAddressId,
  sameAsBilling,
  courierCode,
  express,
  appliedVoucherCode,
  applyLoyalty,
  guestEmail,
  guestConsent,
  lang,
}: UseCartCheckoutActionsOptions) {
  const guestEmailValid = GUEST_EMAIL_PATTERN.test(guestEmail.trim());

  const guestAddressInput = useCallback(
    (id: string | null): checkoutApi.GuestCheckoutAddress | undefined => {
      const address = id ? addresses.find((candidate) => candidate.id === id) : undefined;
      if (!address) return undefined;
      return {
        recipientName: address.recipientName,
        companyName: address.companyName,
        line1: address.line1,
        line2: address.line2,
        deliveryNotes: address.deliveryNotes,
        postalCode: address.postalCode,
        city: address.city,
        countryCode: address.countryCode,
        phone: address.phone,
        networkCodes: address.networkCodes,
        pickupPoints: address.pickupPoints,
        label: address.label,
        savedForFuture: address.savedForFuture === true,
      };
    },
    [addresses],
  );

  const guestCheckoutItems = useCallback(
    (): checkoutApi.GuestCheckoutLine[] =>
      items
        .filter((item) => item.origin !== 'rule' && item.locked !== true)
        .map((item) => ({
          productId: item.productId,
          shapeKey: item.shapeKey,
          lengthKey: item.lengthKey,
          size: item.size,
          packKey: item.packKey ?? '',
          quantity: item.quantity,
          comment: cardComment(items, item) || null,
        })),
    [items],
  );

  const guestCheckoutRequest = useCallback((): checkoutApi.GuestCheckoutRequest | undefined => {
    const address = guestAddressInput(addressId);
    if (!address || !courierCode || !guestEmailValid || !guestConsent) return undefined;
    const billingAddress = sameAsBilling ? undefined : guestAddressInput(billingAddressId);
    if (!sameAsBilling && !billingAddress) return undefined;
    return {
      items: guestCheckoutItems(),
      ...(compositions.length > 0 ? { compositions } : {}),
      address,
      ...(billingAddress ? { billingAddress } : {}),
      courierCode,
      express,
      ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode } : {}),
      email: guestEmail.trim(),
      consent: guestConsent,
      language: lang,
    };
  }, [
    addressId,
    appliedVoucherCode,
    billingAddressId,
    courierCode,
    express,
    guestAddressInput,
    guestCheckoutItems,
    guestConsent,
    guestEmail,
    guestEmailValid,
    lang,
    sameAsBilling,
    compositions,
  ]);

  /** Loyalty earn/credit preview — merchandise only; delivery is irrelevant. */
  const guestLoyaltyPreviewRequest = useCallback(():
    | {
        items: checkoutApi.GuestCheckoutLine[];
        voucherCode?: string;
      }
    | undefined => {
    const items = guestCheckoutItems();
    if (items.length === 0) return undefined;
    return {
      items,
      ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode } : {}),
    };
  }, [appliedVoucherCode, guestCheckoutItems]);

  const createAlternativeIntent = useCallback(
    (method: 'paypal' | 'bancontact', useLoyalty: boolean) => {
      if (status === 'anonymous') {
        const request = guestCheckoutRequest();
        if (!request) return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
        return checkoutApi.createGuestCheckoutIntent(request, method);
      }
      if (!addressId || !courierCode || (!sameAsBilling && !billingAddressId)) {
        return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
      }
      return authedRequest((token) =>
        checkoutApi.createCheckoutIntent(
          token,
          addressId,
          courierCode,
          express,
          method,
          appliedVoucherCode,
          sameAsBilling ? undefined : (billingAddressId ?? undefined),
          undefined,
          useLoyalty,
        ),
      );
    },
    [
      addressId,
      appliedVoucherCode,
      authedRequest,
      billingAddressId,
      courierCode,
      express,
      guestCheckoutRequest,
      sameAsBilling,
      status,
    ],
  );

  const createPayPalIntent = useCallback(
    () => createAlternativeIntent('paypal', applyLoyalty),
    [applyLoyalty, createAlternativeIntent],
  );
  const createBancontactIntent = useCallback(
    () => createAlternativeIntent('bancontact', applyLoyalty),
    [applyLoyalty, createAlternativeIntent],
  );

  const createWalletIntent = useCallback(
    (method: 'google_pay' | 'apple_pay') => {
      if (status === 'anonymous') {
        const request = guestCheckoutRequest();
        if (!request) return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
        return checkoutApi.createGuestCheckoutIntent(request, method);
      }
      if (!addressId || !courierCode || (!sameAsBilling && !billingAddressId)) {
        return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
      }
      return authedRequest((token) =>
        checkoutApi.createCheckoutIntent(
          token,
          addressId,
          courierCode,
          express,
          method,
          appliedVoucherCode,
          sameAsBilling ? undefined : (billingAddressId ?? undefined),
        ),
      );
    },
    [
      addressId,
      appliedVoucherCode,
      authedRequest,
      billingAddressId,
      courierCode,
      express,
      guestCheckoutRequest,
      sameAsBilling,
      status,
    ],
  );

  const createCardIntent = useCallback(
    async (paymentMethodId: string) => {
      if (status === 'anonymous') {
        const request = guestCheckoutRequest();
        if (!request) throw new Error(INCOMPLETE_DELIVERY_ERROR);
        const guestCards = await loadGuestCards();
        const rememberCard =
          guestCards.paymentMethods.find((method) => method.id === paymentMethodId)?.savedForFuture === true;
        return checkoutApi.createGuestCheckoutIntent(
          { ...request, rememberCard },
          undefined,
          paymentMethodId,
        );
      }
      if (!addressId || !courierCode || (!sameAsBilling && !billingAddressId)) {
        return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
      }
      return authedRequest((token) =>
        checkoutApi.createCheckoutIntent(
          token,
          addressId,
          courierCode,
          express,
          undefined,
          appliedVoucherCode,
          sameAsBilling ? undefined : (billingAddressId ?? undefined),
          paymentMethodId,
          applyLoyalty,
        ),
      );
    },
    [
      addressId,
      applyLoyalty,
      appliedVoucherCode,
      authedRequest,
      billingAddressId,
      courierCode,
      express,
      guestCheckoutRequest,
      sameAsBilling,
      status,
    ],
  );

  const createNewCardIntent = useCallback(() => {
    if (status === 'anonymous') {
      const request = guestCheckoutRequest();
      if (!request) return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
      return checkoutApi.createGuestCheckoutIntent(request, 'new_card');
    }
    if (!addressId || !courierCode || (!sameAsBilling && !billingAddressId)) {
      return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
    }
    return authedRequest((token) =>
      checkoutApi.createCheckoutIntent(
        token,
        addressId,
        courierCode,
        express,
        'new_card',
        appliedVoucherCode,
        sameAsBilling ? undefined : (billingAddressId ?? undefined),
        undefined,
        applyLoyalty,
      ),
    );
  }, [
    addressId,
    applyLoyalty,
    appliedVoucherCode,
    authedRequest,
    billingAddressId,
    courierCode,
    express,
    guestCheckoutRequest,
    sameAsBilling,
    status,
  ]);

  const completeFreeOrder = useCallback(() => {
    if (status === 'anonymous') {
      const request = guestCheckoutRequest();
      if (!request) return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
      return checkoutApi.completeGuestFreeCheckout(request);
    }
    if (!addressId || !courierCode || (!sameAsBilling && !billingAddressId)) {
      return Promise.reject(new Error(INCOMPLETE_DELIVERY_ERROR));
    }
    return authedRequest((token) =>
      checkoutApi.completeFreeCheckout(
        token,
        addressId,
        courierCode,
        express,
        appliedVoucherCode,
        sameAsBilling ? undefined : (billingAddressId ?? undefined),
        applyLoyalty,
      ),
    );
  }, [
    addressId,
    applyLoyalty,
    appliedVoucherCode,
    authedRequest,
    billingAddressId,
    courierCode,
    express,
    guestCheckoutRequest,
    sameAsBilling,
    status,
  ]);

  return {
    guestEmailValid,
    guestAddressInput,
    guestCheckoutItems,
    guestCheckoutRequest,
    guestLoyaltyPreviewRequest,
    createPayPalIntent,
    createBancontactIntent,
    createWalletIntent,
    createCardIntent,
    createNewCardIntent,
    completeFreeOrder,
  };
}
