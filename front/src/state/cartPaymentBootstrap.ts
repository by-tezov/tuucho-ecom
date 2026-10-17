import * as authApi from '../api/checkout';
import type { DefaultPaymentMethod, PaymentMethod, ShopPaymentMethods } from '../api/checkout';
import { addEphemeralCard, loadEphemeralCards, removeEphemeralCard } from './ephemeralCards';
import { loadGuestCards } from './guestCardVault';
import { loadGuestState } from './guestCart';
import {
  paymentMethodOverflowTier,
  shopMethodAllowedCountries,
  isCheckoutPaymentPreferenceSentinel,
  COUNTRY_LIST_ALL,
  type ClientCountryContext,
  type PaymentMethodCountries,
} from '../utils/checkoutOverflow';

export const EMPTY_PAYMENT_METHOD_COUNTRIES: PaymentMethodCountries = {
  card: [COUNTRY_LIST_ALL],
  paypal: [COUNTRY_LIST_ALL],
  bancontact: ['BE'],
  googlePay: [COUNTRY_LIST_ALL],
  applePay: [COUNTRY_LIST_ALL],
};

export type PaymentBootstrap = {
  paymentMethods: PaymentMethod[];
  sessionMethods: PaymentMethod[];
  defaultPaymentMethod: DefaultPaymentMethod | null;
  paypalEnabled: boolean;
  bancontactEnabled: boolean;
  googlePayEnabled: boolean;
  applePayEnabled: boolean;
  newCardEnabled: boolean;
  shopPaymentMethods: ShopPaymentMethods;
  paymentMethodCountries: PaymentMethodCountries;
  countryContext: ClientCountryContext;
  /** Initial cart selection id (pm_… | paypal | bancontact | google_pay | apple_pay | new_card). */
  initialPaymentMethodId: string | null;
};

const SHOP_ALL_OFF: ShopPaymentMethods = {
  card: false,
  paypal: false,
  bancontact: false,
  googlePay: false,
  applePay: false,
};

function cardDefaultId(def: DefaultPaymentMethod | null): string | null {
  return def?.type === 'card' ? def.id : null;
}

function effectiveDefault(
  def: DefaultPaymentMethod | null,
  shop: ShopPaymentMethods,
): DefaultPaymentMethod | null {
  if (!def) return null;
  if (def.type === 'paypal') return shop.paypal ? def : null;
  if (def.type === 'bancontact') return shop.bancontact ? def : null;
  if (def.type === 'google_pay') return shop.googlePay ? def : null;
  if (def.type === 'apple_pay') return shop.applePay ? def : null;
  return shop.card ? def : null;
}

function isPreferenceSentinel(id: string): boolean {
  return isCheckoutPaymentPreferenceSentinel(id);
}

function resolveInitialPaymentMethodId(
  def: DefaultPaymentMethod | null,
  paymentMethods: PaymentMethod[],
  userPaypal: boolean,
  userBancontact: boolean,
  userGooglePay: boolean,
  userApplePay: boolean,
  userNewCard: boolean,
  shop: ShopPaymentMethods,
  preferredId: string | null,
  countries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
): string | null {
  const primaryOnly = (
    method: 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay' | 'card',
    shopOn: boolean,
    userEnabled: boolean,
  ) => {
    if (!shopOn) return false;
    return (
      paymentMethodOverflowTier(
        shopOn,
        userEnabled,
        true,
        shopMethodAllowedCountries(method, countries),
        effectiveCountries,
      ) === 'primary'
    );
  };

  const sentinelStillChoosable = (
    method: 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay' | 'card',
    shopOn: boolean,
    userEnabled: boolean,
    deviceAvailable: boolean,
  ) => {
    if (!shopOn) return false;
    return (
      paymentMethodOverflowTier(
        shopOn,
        userEnabled,
        deviceAvailable,
        shopMethodAllowedCountries(method, countries),
        effectiveCountries,
      ) !== 'hidden'
    );
  };

  let initial = preferredId;
  if (initial === 'paypal' && !sentinelStillChoosable('paypal', shop.paypal, userPaypal, true)) {
    initial = null;
  } else if (
    initial === 'bancontact' &&
    !sentinelStillChoosable('bancontact', shop.bancontact, userBancontact, true)
  ) {
    initial = null;
  } else if (
    initial === 'google_pay' &&
    !sentinelStillChoosable('google_pay', shop.googlePay, userGooglePay, true)
  ) {
    initial = null;
  } else if (
    initial === 'apple_pay' &&
    !sentinelStillChoosable('apple_pay', shop.applePay, userApplePay, true)
  ) {
    initial = null;
  } else if (initial === 'new_card' && !sentinelStillChoosable('card', shop.card, userNewCard, true)) {
    initial = null;
  } else if (initial && !isPreferenceSentinel(initial)) {
    if (!shop.card) {
      initial = null;
    } else if (
      paymentMethodOverflowTier(
        shop.card,
        true,
        true,
        shopMethodAllowedCountries('card', countries),
        effectiveCountries,
      ) === 'hidden'
    ) {
      initial = null;
    }
  }

  if (initial) return initial;

  if (def?.type === 'paypal' && primaryOnly('paypal', shop.paypal, userPaypal)) return 'paypal';
  if (def?.type === 'bancontact' && primaryOnly('bancontact', shop.bancontact, userBancontact))
    return 'bancontact';
  if (def?.type === 'google_pay' && primaryOnly('google_pay', shop.googlePay, userGooglePay))
    return 'google_pay';
  if (def?.type === 'apple_pay' && primaryOnly('apple_pay', shop.applePay, userApplePay)) return 'apple_pay';
  if (shop.card) {
    const defaultCardId = cardDefaultId(def);
    if (defaultCardId && paymentMethods.some((method) => method.id === defaultCardId)) {
      return defaultCardId;
    }
  }
  return null;
}

export async function loadGuestPaymentBootstrap(deliveryCountry?: string | null): Promise<PaymentBootstrap> {
  const [guestCards, shopResult] = await Promise.all([
    loadGuestCards(),
    authApi.getShopPaymentMethods(deliveryCountry ?? undefined).catch(() => ({
      shopPaymentMethods: SHOP_ALL_OFF,
      paymentMethodCountries: EMPTY_PAYMENT_METHOD_COUNTRIES,
      countryContext: {
        deliveryCountry: deliveryCountry?.toUpperCase() ?? null,
        geoCountry: null,
        effectiveCountries: deliveryCountry ? [deliveryCountry.toUpperCase()] : [],
      },
    })),
  ]);
  const shop = shopResult.shopPaymentMethods;
  const countries = shopResult.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES;
  const countryContext = shopResult.countryContext ?? {
    deliveryCountry: deliveryCountry?.toUpperCase() ?? null,
    geoCountry: null,
    effectiveCountries: deliveryCountry ? [deliveryCountry.toUpperCase()] : [],
  };
  const saved = guestCards.paymentMethods.filter((m) => m.savedForFuture !== false);
  const sessionMethods = loadEphemeralCards();
  const def = effectiveDefault(guestCards.defaultPaymentMethod, shop);

  return {
    paymentMethods: saved,
    sessionMethods,
    defaultPaymentMethod: def,
    paypalEnabled: true,
    bancontactEnabled: true,
    googlePayEnabled: true,
    applePayEnabled: true,
    newCardEnabled: true,
    shopPaymentMethods: shop,
    paymentMethodCountries: countries,
    countryContext,
    initialPaymentMethodId: resolveInitialPaymentMethodId(
      def,
      guestCards.paymentMethods,
      true,
      true,
      true,
      true,
      true,
      shop,
      loadGuestState().paymentMethodId,
      countries,
      countryContext.effectiveCountries,
    ),
  };
}

type AuthedRequest = <T>(fn: (token: string) => Promise<T>) => Promise<T>;

export async function loadAuthPaymentBootstrap(
  authedRequest: AuthedRequest,
  selectedPaymentMethodId: string | null,
  deliveryCountry?: string | null,
): Promise<PaymentBootstrap> {
  const [result, shopFlags] = await Promise.all([
    authedRequest((token) => authApi.listPaymentMethods(token)),
    authApi.getShopPaymentMethods(deliveryCountry ?? undefined).catch(() => ({
      shopPaymentMethods: SHOP_ALL_OFF,
      paymentMethodCountries: EMPTY_PAYMENT_METHOD_COUNTRIES,
      countryContext: {
        deliveryCountry: deliveryCountry?.toUpperCase() ?? null,
        geoCountry: null,
        effectiveCountries: deliveryCountry ? [deliveryCountry.toUpperCase()] : [],
      },
    })),
  ]);
  const shop = result.shopPaymentMethods;
  const countries = shopFlags.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES;
  const countryContext = shopFlags.countryContext ?? {
    deliveryCountry: deliveryCountry?.toUpperCase() ?? null,
    geoCountry: null,
    effectiveCountries: deliveryCountry ? [deliveryCountry.toUpperCase()] : [],
  };
  let ephemeral = loadEphemeralCards();
  let clearedSelection = false;

  const selectedId = selectedPaymentMethodId;
  if (
    selectedId &&
    !isPreferenceSentinel(selectedId) &&
    !result.paymentMethods.some((m) => m.id === selectedId)
  ) {
    if (!shop.card) {
      ephemeral = removeEphemeralCard(selectedId);
      clearedSelection = true;
    } else {
      const hydrated = await authedRequest((token) => authApi.getPaymentMethod(token, selectedId)).catch(
        () => null,
      );
      if (hydrated?.paymentMethod) {
        ephemeral = addEphemeralCard(hydrated.paymentMethod);
      } else {
        ephemeral = removeEphemeralCard(selectedId);
        clearedSelection = true;
      }
    }
  }

  return {
    paymentMethods: result.paymentMethods,
    sessionMethods: ephemeral,
    defaultPaymentMethod: result.defaultPaymentMethod,
    paypalEnabled: result.paypalEnabled,
    bancontactEnabled: result.bancontactEnabled,
    googlePayEnabled: result.googlePayEnabled,
    applePayEnabled: result.applePayEnabled,
    newCardEnabled: result.newCardEnabled,
    shopPaymentMethods: shop,
    paymentMethodCountries: countries,
    countryContext,
    initialPaymentMethodId: resolveInitialPaymentMethodId(
      result.defaultPaymentMethod,
      result.paymentMethods,
      result.paypalEnabled,
      result.bancontactEnabled,
      result.googlePayEnabled,
      result.applePayEnabled,
      result.newCardEnabled,
      shop,
      clearedSelection ? null : selectedPaymentMethodId,
      countries,
      countryContext.effectiveCountries,
    ),
  };
}
