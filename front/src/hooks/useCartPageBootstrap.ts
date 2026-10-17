import { useEffect, useRef, useState } from 'react';
import type { AuthStatus } from '../state/AuthContext';
import type { WalletAvailability } from './useWalletAvailability';
import { probeWalletAvailability } from './probeWalletAvailability';
import {
  loadAuthDeliveryBootstrap,
  loadGuestDeliveryBootstrap,
  type DeliveryBootstrap,
} from '../state/cartDeliveryBootstrap';
import {
  EMPTY_PAYMENT_METHOD_COUNTRIES,
  loadAuthPaymentBootstrap,
  loadGuestPaymentBootstrap,
  type PaymentBootstrap,
} from '../state/cartPaymentBootstrap';
import { isSelectedPaymentMethodStillValid } from '../utils/checkoutOverflow';
import { loadGuestCheckoutDraft } from '../state/guestCheckoutDraft';
import { audienceForStatus } from '../state/productCache';
import {
  invalidateCartBootstrapCache,
  readCartBootstrapCache,
  scrubDeletedCheckoutEntities,
  writeCartBootstrapCache,
  type CartBootstrapData,
} from '../state/cartBootstrapCache';

const GUEST_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_DELIVERY: DeliveryBootstrap = {
  addresses: [],
  countries: [],
  couriers: [],
  disabledCourierCodes: [],
  defaultCourierCode: null,
  selection: {
    addressId: null,
    billingAddressId: null,
    sameAsBilling: true,
    courierCode: null,
    express: false,
    paymentMethodId: null,
    voucherCode: null,
  },
};

const EMPTY_PAYMENT: PaymentBootstrap = {
  paymentMethods: [],
  sessionMethods: [],
  defaultPaymentMethod: null,
  paypalEnabled: false,
  bancontactEnabled: false,
  googlePayEnabled: false,
  applePayEnabled: false,
  newCardEnabled: false,
  shopPaymentMethods: {
    card: false,
    paypal: false,
    bancontact: false,
    googlePay: false,
    applePay: false,
  },
  paymentMethodCountries: EMPTY_PAYMENT_METHOD_COUNTRIES,
  countryContext: { deliveryCountry: null, geoCountry: null, effectiveCountries: [] },
  initialPaymentMethodId: null,
};

/** Warm-cache first paint: never show shop-gated payment/courier/country rows
 * until Phase B confirms they are offered. Avoids flash-then-hide when a
 * Boutique toggle (or user pref) turned something off since the last visit. */
function pendingShopGates(cached: CartBootstrapData): CartBootstrapData {
  return {
    ...cached,
    delivery: {
      ...cached.delivery,
      countries: [],
      couriers: [],
    },
    payment: {
      ...cached.payment,
      paypalEnabled: false,
      bancontactEnabled: false,
      googlePayEnabled: false,
      applePayEnabled: false,
      newCardEnabled: false,
      shopPaymentMethods: {
        card: false,
        paypal: false,
        bancontact: false,
        googlePay: false,
        applePay: false,
      },
    },
    walletAvailability: { googlePay: false, applePay: false, ready: false },
  };
}

const UNAVAILABLE_WALLETS: WalletAvailability = {
  googlePay: false,
  applePay: false,
  ready: true,
};

export type CartBootstrapStatus =
  'auth_loading' | 'cart_loading' | 'bootstrapping' | 'empty' | 'ready' | 'switching';

export type { CartBootstrapData };

export type CartBootstrapResult = {
  status: CartBootstrapStatus;
  data: CartBootstrapData | null;
  /** Bump when cart switch starts; cleared when Phase B for the new cart finishes. */
  beginSwitch: () => void;
  /** Clear switching if activate/delete failed without a generation change. */
  endSwitch: () => void;
};

type AuthedRequest = <T>(fn: (token: string) => Promise<T>) => Promise<T>;

function guestCheckoutReadyFromDraft(): boolean {
  const draft = loadGuestCheckoutDraft();
  return GUEST_EMAIL_PATTERN.test(draft.email.trim()) && draft.consent;
}

function buildSnapshot(
  generation: string,
  revision: number,
  status: AuthStatus,
  delivery: DeliveryBootstrap,
  payment: PaymentBootstrap,
  walletAvailability: WalletAvailability,
): CartBootstrapData {
  // Guest: merge payment default into selection (loader left paymentMethodId null).
  if (status === 'anonymous') {
    delivery.selection.paymentMethodId = payment.initialPaymentMethodId;
  } else if (payment.initialPaymentMethodId !== null) {
    delivery.selection.paymentMethodId = payment.initialPaymentMethodId;
  }

  // Drop wallet/card selections the shop or device cannot use at all (admin-off).
  const pm = delivery.selection.paymentMethodId;
  const shop = payment.shopPaymentMethods;
  const countries = payment.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES;
  const effective = payment.countryContext?.effectiveCountries ?? [];
  if (pm && !isSelectedPaymentMethodStillValid(pm, shop, payment, walletAvailability, countries, effective)) {
    delivery.selection.paymentMethodId = null;
  }

  return {
    generation,
    revision,
    delivery,
    payment,
    walletAvailability,
    guestCheckoutReady: status === 'anonymous' ? guestCheckoutReadyFromDraft() : true,
  };
}

async function runPhaseB(
  status: AuthStatus,
  authedRequest: AuthedRequest,
): Promise<{
  delivery: DeliveryBootstrap;
  payment: PaymentBootstrap;
  walletAvailability: WalletAvailability;
}> {
  // Guest: overlap a null-country payment probe with delivery + wallet. Reuse
  // it when no address country is known; otherwise load country-scoped methods.
  // Auth still waits on delivery for paymentMethodId before payment bootstrap.
  const guestPaymentNullProbe = status === 'anonymous' ? loadGuestPaymentBootstrap(null) : null;
  const [delivery, walletAvailability] = await Promise.all([
    status === 'anonymous' ? loadGuestDeliveryBootstrap() : loadAuthDeliveryBootstrap(authedRequest),
    probeWalletAvailability(),
  ]);
  const deliveryCountry = delivery.addresses.find((a) => a.id === delivery.selection.addressId)?.countryCode;
  const payment =
    status === 'anonymous'
      ? deliveryCountry
        ? await loadGuestPaymentBootstrap(deliveryCountry)
        : await guestPaymentNullProbe!
      : await loadAuthPaymentBootstrap(authedRequest, delivery.selection.paymentMethodId, deliveryCountry);
  return { delivery, payment, walletAvailability };
}

function initialBootstrap(options: {
  status: AuthStatus;
  cartReady: boolean;
  hasUserLines: boolean;
  activeCartId: string | null;
  lang: string;
}): { status: CartBootstrapStatus; data: CartBootstrapData | null } {
  if (options.status === 'loading') return { status: 'auth_loading', data: null };
  if (!options.cartReady) return { status: 'cart_loading', data: null };
  if (!options.hasUserLines) return { status: 'empty', data: null };
  const audience = audienceForStatus(options.status);
  if (!audience) return { status: 'cart_loading', data: null };
  const generation = `${options.status}:${options.activeCartId ?? 'none'}:${options.lang}`;
  const cached = readCartBootstrapCache(generation, audience);
  if (cached) return { status: 'ready', data: cached };
  return { status: 'bootstrapping', data: null };
}

/**
 * Single generation-keyed cart page bootstrap (guest vs auth).
 * Warm SPA sessions paint from cartBootstrapCache then silently revalidate;
 * cold sessions keep the blocking LoadingModal path.
 */
export function useCartPageBootstrap(options: {
  status: AuthStatus;
  cartReady: boolean;
  /** False when the cart has no customer-owned lines (empty UI, skip Phase B). */
  hasUserLines: boolean;
  activeCartId: string | null;
  lang: string;
  authedRequest: AuthedRequest;
}): CartBootstrapResult {
  const { status, cartReady, hasUserLines, activeCartId, lang, authedRequest } = options;

  const [bootStatus, setBootStatus] = useState<CartBootstrapStatus>(() => initialBootstrap(options).status);
  const [data, setData] = useState<CartBootstrapData | null>(() => initialBootstrap(options).data);
  const generationRef = useRef(0);
  const switchingRef = useRef(false);
  const previousDataRef = useRef<CartBootstrapData | null>(data);
  const revisionRef = useRef(data?.revision ?? 0);

  const beginSwitch = () => {
    if (!previousDataRef.current && !data) return;
    switchingRef.current = true;
    setBootStatus('switching');
  };

  const endSwitch = () => {
    if (!switchingRef.current) return;
    switchingRef.current = false;
    if (previousDataRef.current || data) {
      setData(previousDataRef.current ?? data);
      setBootStatus('ready');
    }
  };

  useEffect(() => {
    if (status === 'loading') {
      setBootStatus('auth_loading');
      setData(null);
      previousDataRef.current = null;
      return;
    }
    if (!cartReady) {
      setBootStatus('cart_loading');
      if (!switchingRef.current) {
        setData(null);
        previousDataRef.current = null;
      }
      return;
    }
    if (!hasUserLines) {
      switchingRef.current = false;
      setBootStatus('empty');
      setData(null);
      previousDataRef.current = null;
      invalidateCartBootstrapCache('empty');
      return;
    }

    const audience = audienceForStatus(status);
    if (!audience) return;

    const generation = `${status}:${activeCartId ?? 'none'}:${lang}`;
    const myGen = ++generationRef.current;
    const cached = readCartBootstrapCache(generation, audience);
    const silent = !!cached && !switchingRef.current;

    if (silent && cached) {
      previousDataRef.current = cached;
      // Paint addresses from cache, but keep payment/courier/country gates
      // closed until the silent revalidate confirms what the shop still offers.
      setData(pendingShopGates(cached));
      setBootStatus('ready');
      revisionRef.current = cached.revision;
    } else if (!switchingRef.current) {
      // Guest→auth (or any generation change while not mid-switch): blank shell.
      setBootStatus('bootstrapping');
      setData(null);
    } else {
      setBootStatus('switching');
    }

    let cancelled = false;

    void (async () => {
      try {
        const { delivery, payment, walletAvailability } = await runPhaseB(status, authedRequest);
        if (cancelled || myGen !== generationRef.current) return;

        const revision = silent ? revisionRef.current + 1 : 1;
        revisionRef.current = revision;
        // A delete made while this was in flight must not come back.
        const next = scrubDeletedCheckoutEntities(
          buildSnapshot(generation, revision, status, delivery, payment, walletAvailability),
        );
        previousDataRef.current = next;
        switchingRef.current = false;
        writeCartBootstrapCache(generation, audience, next);
        setData(next);
        setBootStatus('ready');
      } catch {
        if (cancelled || myGen !== generationRef.current) return;
        switchingRef.current = false;
        if (silent) {
          // Keep painted cache; fail open without wiping the warm snapshot.
          setBootStatus('ready');
          return;
        }
        // Fail open so the page settles instead of spinning forever; the
        // customer can still pick address/courier/payment manually.
        const fallback = buildSnapshot(
          generation,
          1,
          status,
          EMPTY_DELIVERY,
          EMPTY_PAYMENT,
          UNAVAILABLE_WALLETS,
        );
        previousDataRef.current = fallback;
        setData(fallback);
        setBootStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, cartReady, hasUserLines, activeCartId, lang, authedRequest]);

  return {
    status: bootStatus,
    data: bootStatus === 'switching' ? (data ?? previousDataRef.current) : data,
    beginSwitch,
    endSwitch,
  };
}
