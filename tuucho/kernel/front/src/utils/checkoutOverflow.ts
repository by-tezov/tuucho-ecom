import type { ShopPaymentMethods } from '../api/checkout';

export type CheckoutOverflowTier = 'primary' | 'overflow' | 'hidden';

export type ClientCountryContext = {
  deliveryCountry: string | null;
  geoCountry: string | null;
  effectiveCountries: string[];
};

/** Sentinel in allowlists meaning “every country” (empty list is not worldwide). */
export const COUNTRY_LIST_ALL = 'ALL';

export function isWorldwideCountryList(allowedCountries: readonly string[]): boolean {
  return allowedCountries.some((c) => c.toUpperCase() === COUNTRY_LIST_ALL);
}

export type PaymentMethodCountries = {
  card: string[];
  paypal: string[];
  bancontact: string[];
  googlePay: string[];
  applePay: string[];
};

/** Bancontact is Belgium-only; an empty admin list must not mean "worldwide". */
const BANCONTACT_DEFAULT_COUNTRIES = ['BE'] as const;

function resolveShopMethodAllowedCountries(
  method: 'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay',
  countries: PaymentMethodCountries,
): string[] {
  if (method === 'card') return countries.card;
  if (method === 'paypal') return countries.paypal;
  if (method === 'bancontact') {
    return countries.bancontact.length > 0 ? countries.bancontact : [...BANCONTACT_DEFAULT_COUNTRIES];
  }
  if (method === 'google_pay') return countries.googlePay;
  return countries.applePay;
}

export function countryListMatchesEffective(
  allowedCountries: readonly string[],
  effectiveCountries: readonly string[],
): boolean {
  if (isWorldwideCountryList(allowedCountries)) return true;
  if (allowedCountries.length === 0) return false;
  if (effectiveCountries.length === 0) return false;
  const allowed = new Set(allowedCountries.map((c) => c.toUpperCase()).filter((c) => c !== COUNTRY_LIST_ALL));
  return effectiveCountries.some((c) => allowed.has(c.toUpperCase()));
}

export function buildEffectiveCountries(
  deliveryCountry: string | null | undefined,
  geoCountry: string | null | undefined,
): string[] {
  const out = new Set<string>();
  if (deliveryCountry) out.add(deliveryCountry.toUpperCase());
  if (geoCountry) out.add(geoCountry.toUpperCase());
  return [...out];
}

/** The selected delivery country must win over a bootstrap snapshot. Payment
 * and courier overflow otherwise keep a previous geo-only list until the
 * payment-methods refresh returns, which hides Bancontact after a BE address
 * is already chosen. */
export function liveEffectiveCountries(
  deliveryCountry: string | null | undefined,
  geoCountry: string | null | undefined,
  snapshot: readonly string[] = [],
): string[] {
  const live = buildEffectiveCountries(deliveryCountry, geoCountry);
  if (live.length > 0) return live;
  return [...snapshot];
}

export function paymentMethodOverflowTier(
  shopEnabled: boolean,
  userEnabled: boolean,
  deviceAvailable: boolean,
  allowedCountries: readonly string[],
  effectiveCountries: readonly string[],
): CheckoutOverflowTier {
  if (!shopEnabled || !deviceAvailable) return 'hidden';
  // A profile opt-out stays choosable from the overflow, like a courier the
  // customer hid. The current choice is promoted back into the main list.
  if (!userEnabled) return 'overflow';
  const countryOk = countryListMatchesEffective(allowedCountries, effectiveCountries);
  if (countryOk) return 'primary';
  return 'overflow';
}

/** Overflow stays in the main list only while it is the current choice. */
export function checkoutChoicePlacement(
  tier: CheckoutOverflowTier,
  isCurrentChoice: boolean,
): 'list' | 'overflow' | 'hidden' {
  if (tier === 'hidden') return 'hidden';
  if (tier === 'primary' || isCurrentChoice) return 'list';
  return 'overflow';
}

export function courierOverflowTier(
  userDisabled: boolean,
  servedCountries: readonly string[],
  effectiveCountries: readonly string[],
): CheckoutOverflowTier {
  if (userDisabled) return 'overflow';
  // No delivery/geo yet: keep the shop list visible. An empty country context
  // is not a mismatch — only Cacher opt-outs belong in overflow then.
  if (effectiveCountries.length === 0) return 'primary';
  return countryListMatchesEffective(servedCountries, effectiveCountries) ? 'primary' : 'overflow';
}

function isPaymentMethodCheckoutAllowed(
  shopEnabled: boolean,
  allowedCountries: readonly string[],
  effectiveCountries: readonly string[],
): boolean {
  if (!shopEnabled) return false;
  return countryListMatchesEffective(allowedCountries, effectiveCountries);
}

export function shopMethodAllowedCountries(
  method: 'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay',
  countries: PaymentMethodCountries,
): string[] {
  return resolveShopMethodAllowedCountries(method, countries);
}

export type PaymentPrefs = {
  paypalEnabled: boolean;
  bancontactEnabled: boolean;
  googlePayEnabled: boolean;
  applePayEnabled: boolean;
  newCardEnabled: boolean;
};

function paymentMethodIdOverflowTier(
  id: string,
  shop: ShopPaymentMethods,
  prefs: PaymentPrefs,
  walletAvailability: { googlePay: boolean; applePay: boolean },
  countries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
): CheckoutOverflowTier {
  if (id === 'paypal') {
    return paymentMethodOverflowTier(
      shop.paypal,
      prefs.paypalEnabled,
      true,
      resolveShopMethodAllowedCountries('paypal', countries),
      effectiveCountries,
    );
  }
  if (id === 'bancontact') {
    return paymentMethodOverflowTier(
      shop.bancontact,
      prefs.bancontactEnabled,
      true,
      resolveShopMethodAllowedCountries('bancontact', countries),
      effectiveCountries,
    );
  }
  if (id === 'google_pay') {
    return paymentMethodOverflowTier(
      shop.googlePay,
      prefs.googlePayEnabled,
      walletAvailability.googlePay,
      resolveShopMethodAllowedCountries('google_pay', countries),
      effectiveCountries,
    );
  }
  if (id === 'apple_pay') {
    return paymentMethodOverflowTier(
      shop.applePay,
      prefs.applePayEnabled,
      walletAvailability.applePay,
      resolveShopMethodAllowedCountries('apple_pay', countries),
      effectiveCountries,
    );
  }
  if (id === 'new_card') {
    return paymentMethodOverflowTier(
      shop.card,
      prefs.newCardEnabled,
      true,
      resolveShopMethodAllowedCountries('card', countries),
      effectiveCountries,
    );
  }
  // Remembered cards: shop + country only (profile new-card toggle does not hide them).
  return paymentMethodOverflowTier(
    shop.card,
    true,
    true,
    resolveShopMethodAllowedCountries('card', countries),
    effectiveCountries,
  );
}

export function isCheckoutPaymentPreferenceSentinel(id: string): boolean {
  return (
    id === 'paypal' ||
    id === 'bancontact' ||
    id === 'google_pay' ||
    id === 'apple_pay' ||
    id === 'new_card'
  );
}

export type PaymentOverflowKey =
  | 'paypal'
  | 'bancontact'
  | 'google_pay'
  | 'apple_pay'
  | 'new_card'
  | 'card';

/** When a persisted checkout payment sits in the overflow tier, promote it
 * into the primary list for this cart session (same as courier overflow). */
export function paymentOverflowKeyForSelection(
  id: string,
  shop: ShopPaymentMethods,
  prefs: PaymentPrefs,
  walletAvailability: { googlePay: boolean; applePay: boolean },
  countries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
): PaymentOverflowKey | null {
  if (
    paymentMethodIdOverflowTier(id, shop, prefs, walletAvailability, countries, effectiveCountries) !==
    'overflow'
  ) {
    return null;
  }
  if (id === 'new_card') return 'new_card';
  if (isCheckoutPaymentPreferenceSentinel(id)) return id as PaymentOverflowKey;
  return 'card';
}

function isShopMethodVisible(
  method: 'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay',
  shop: ShopPaymentMethods,
  userEnabled: boolean,
  deviceAvailable: boolean,
  countries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
): boolean {
  const shopOn =
    method === 'card'
      ? shop.card
      : method === 'paypal'
        ? shop.paypal
        : method === 'bancontact'
          ? shop.bancontact
          : method === 'google_pay'
            ? shop.googlePay
            : shop.applePay;
  return (
    paymentMethodOverflowTier(
      shopOn,
      userEnabled,
      deviceAvailable,
      shopMethodAllowedCountries(method, countries),
      effectiveCountries,
    ) !== 'hidden'
  );
}

export function isSelectedPaymentMethodStillValid(
  id: string,
  shop: ShopPaymentMethods,
  prefs: PaymentPrefs,
  walletAvailability: { googlePay: boolean; applePay: boolean },
  countries: PaymentMethodCountries,
  effectiveCountries: readonly string[],
): boolean {
  if (id === 'paypal') {
    return isShopMethodVisible('paypal', shop, prefs.paypalEnabled, true, countries, effectiveCountries);
  }
  if (id === 'bancontact') {
    return isShopMethodVisible(
      'bancontact',
      shop,
      prefs.bancontactEnabled,
      true,
      countries,
      effectiveCountries,
    );
  }
  if (id === 'google_pay') {
    return isShopMethodVisible(
      'google_pay',
      shop,
      prefs.googlePayEnabled,
      walletAvailability.googlePay,
      countries,
      effectiveCountries,
    );
  }
  if (id === 'apple_pay') {
    return isShopMethodVisible(
      'apple_pay',
      shop,
      prefs.applePayEnabled,
      walletAvailability.applePay,
      countries,
      effectiveCountries,
    );
  }
  if (id === 'new_card') {
    return isShopMethodVisible('card', shop, prefs.newCardEnabled, true, countries, effectiveCountries);
  }
  return (
    shop.card &&
    isPaymentMethodCheckoutAllowed(
      shop.card,
      resolveShopMethodAllowedCountries('card', countries),
      effectiveCountries,
    )
  );
}
