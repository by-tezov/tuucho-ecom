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

async function runPhaseBShop(
  status: AuthStatus,
  authedRequest: AuthedRequest,
): Promise<{ delivery: DeliveryBootstrap; payment: PaymentBootstrap }> {
  const guestPaymentNullProbe = status === 'anonymous' ? loadGuestPaymentBootstrap(null) : null;
  const delivery =
    status === 'anonymous' ? await loadGuestDeliveryBootstrap() : await loadAuthDeliveryBootstrap(authedRequest);
  const deliveryCountry = delivery.addresses.find((a) => a.id === delivery.selection.addressId)?.countryCode;
  const payment =
    status === 'anonymous'
      ? deliveryCountry
        ? await loadGuestPaymentBootstrap(deliveryCountry)
        : await guestPaymentNullProbe!
      : await loadAuthPaymentBootstrap(authedRequest, delivery.selection.paymentMethodId, deliveryCountry);
  return { delivery, payment };
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
      setData(cached);
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
      const painted = previousDataRef.current;
      try {
        const { delivery, payment } = await runPhaseBShop(status, authedRequest);
        if (cancelled || myGen !== generationRef.current) {
          if (painted) setData(painted);
          return;
        }

        const revision = silent ? revisionRef.current + 1 : 1;
        revisionRef.current = revision;
        const wallets =
          silent && cached?.walletAvailability.ready
            ? cached.walletAvailability
            : { googlePay: false, applePay: false, ready: false };
        const next = scrubDeletedCheckoutEntities(
          buildSnapshot(generation, revision, status, delivery, payment, wallets),
        );
        previousDataRef.current = next;
        switchingRef.current = false;
        writeCartBootstrapCache(generation, audience, next);
        setData(next);
        setBootStatus('ready');

        void probeWalletAvailability()
          .then((walletAvailability) => {
            if (cancelled || myGen !== generationRef.current) return;
            const withWallets = scrubDeletedCheckoutEntities({
              ...next,
              walletAvailability,
            });
            previousDataRef.current = withWallets;
            writeCartBootstrapCache(generation, audience, withWallets);
            setData(withWallets);
          })
          .catch(() => undefined);
      } catch {
        if (cancelled || myGen !== generationRef.current) {
          if (painted) setData(painted);
          return;
        }
        switchingRef.current = false;
        if (silent && painted) {
          setData(painted);
          setBootStatus('ready');
          return;
        }
        if (painted) {
          setData(painted);
          setBootStatus('ready');
          return;
        }
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
