import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { shopConfig } from '../../config/env';
import { useAuthSession } from '../../state/AuthContext';
import * as authApi from '../../api/checkout';
import { type PaymentMethod } from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LoadingModal } from '../ui/LoadingModal';
import { loadGuestCards, saveGuestCards } from '../../state/guestCardVault';
import {
  addEphemeralCard,
  clearEphemeralCards,
  loadEphemeralCards,
  removeEphemeralCard,
} from '../../state/ephemeralCards';
import { clearEphemeralAddresses } from '../../state/ephemeralAddresses';
import { markCheckoutEntityDeleted } from '../../state/cartBootstrapCache';
import { clearGuestCheckoutAfterOrder } from '../../state/guestCheckoutCompletion';
import { withMinDuration, withTimeout } from '../../utils/withMinDuration';
import {
  type CartCheckoutSectionProps,
  type CheckoutFormState,
  type ConfirmItemCounts,
  type CheckoutPaymentBootstrap,
  type PreparedPaymentIntent,
  type WalletCheckoutMethod,
} from './checkoutContracts';
import {
  isSelectedPaymentMethodStillValid,
  liveEffectiveCountries,
  paymentOverflowKeyForSelection,
  type ClientCountryContext,
  type PaymentMethodCountries,
} from '../../utils/checkoutOverflow';
import { mapCheckoutErrorMessage } from './checkoutErrorMessage';
import { EMPTY_PAYMENT_METHOD_COUNTRIES } from '../../state/cartPaymentBootstrap';
import {
  buildPaymentOverflowOptions,
  CheckoutPaymentMethodList,
  type PaymentOverflowKey,
} from './CheckoutPaymentMethodList';
import { CheckoutOverflowMoreLink } from './CheckoutOverflowMoreLink';
import { CheckoutOverflowPickerModal } from './CheckoutOverflowPickerModal';
import styles from '../cart/CartCheckoutSection.module.css';

/** First-paint payment snapshot from useCartPageBootstrap — no internal
 * wallet probe or methods fetch before the radios render. */
function isWalletCheckoutMethod(value: string | null | undefined): value is WalletCheckoutMethod {
  return value === 'google_pay' || value === 'apple_pay';
}

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

/* Public checkout contract lives in checkoutContracts.ts so payment methods,
 * route state and confirmation dialogs share one source of truth. */
export type {
  CartCheckoutSectionProps,
  CheckoutFormState,
  CheckoutPaymentBootstrap,
} from './checkoutContracts';
/** Renders in place on the cart page itself, right below the shipping fee
 * row. Payment-method selection is deliberately outside Stripe Elements so
 * changing delivery details never remounts or visually flickers the
 * payment-method list itself.
 *
 * A previously-saved card is a plain radio list, confirmed via
 * confirmCardPayment against a PaymentIntent created only once the
 * confirmation dialog opens. Choosing "Nouvelle carte" creates a card-only
 * PaymentIntent and collects the card in the pay sheet (one bank auth for
 * the order amount). Profile add-card still uses SetupIntent. One shared
 * "Payer" button drives whichever method is selected — see handleSubmit. */
export function CartCheckoutSection({
  t,
  deliveryReady,
  isFreeOrder,
  total,
  selectedPaymentMethodId,
  onPaymentMethodChange,
  formId,
  onStateChange,
  onSuccess,
  onCreateCardIntent,
  onCreateNewCardIntent,
  onCreatePayPalIntent,
  onCreateBancontactIntent,
  onCreateWalletIntent,
  onCompleteFreeOrder,
  guestCheckoutReady,
  hasOutOfStockItems,
  itemCounts,
  receiptEmail,
  paymentBootstrap,
  shippingCountryCode,
  deliveryAddress,
}: CartCheckoutSectionProps) {
  return (
    <CheckoutBody
      t={t}
      deliveryReady={deliveryReady}
      isFreeOrder={isFreeOrder}
      total={total}
      selectedPaymentMethodId={selectedPaymentMethodId}
      onPaymentMethodChange={onPaymentMethodChange}
      formId={formId}
      onStateChange={onStateChange}
      onSuccess={onSuccess}
      onCreateCardIntent={onCreateCardIntent}
      onCreateNewCardIntent={onCreateNewCardIntent}
      onCreatePayPalIntent={onCreatePayPalIntent}
      onCreateBancontactIntent={onCreateBancontactIntent}
      onCreateWalletIntent={onCreateWalletIntent}
      onCompleteFreeOrder={onCompleteFreeOrder}
      guestCheckoutReady={guestCheckoutReady}
      hasOutOfStockItems={hasOutOfStockItems}
      itemCounts={itemCounts}
      receiptEmail={receiptEmail}
      paymentBootstrap={paymentBootstrap}
      shippingCountryCode={shippingCountryCode}
      deliveryAddress={deliveryAddress}
    />
  );
}

function CheckoutBody({
  t,
  deliveryReady,
  isFreeOrder,
  total,
  selectedPaymentMethodId,
  onPaymentMethodChange,
  formId,
  onStateChange,
  onSuccess,
  onCreateCardIntent,
  onCreateNewCardIntent,
  onCreatePayPalIntent,
  onCreateBancontactIntent,
  onCreateWalletIntent,
  onCompleteFreeOrder,
  guestCheckoutReady,
  hasOutOfStockItems,
  itemCounts,
  receiptEmail,
  paymentBootstrap,
  shippingCountryCode,
  deliveryAddress,
}: {
  t: Strings;
  deliveryReady: boolean;
  isFreeOrder: boolean;
  total: number;
  selectedPaymentMethodId: string | null;
  onPaymentMethodChange: (id: string | null) => void;
  formId: string;
  onStateChange: (state: CheckoutFormState) => void;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onCreateCardIntent: (
    paymentMethodId: string,
  ) => Promise<{ clientSecret: string; reservationExpiresAt: string }>;
  onCreateNewCardIntent: () => Promise<{ clientSecret: string; reservationExpiresAt: string }>;
  onCreatePayPalIntent: () => Promise<{ clientSecret: string; reservationExpiresAt: string }>;
  onCreateBancontactIntent: () => Promise<{ clientSecret: string; reservationExpiresAt: string }>;
  onCreateWalletIntent: (
    method: WalletCheckoutMethod,
  ) => Promise<{ clientSecret: string; reservationExpiresAt: string }>;
  onCompleteFreeOrder: () => Promise<{ order: { orderNumber: string; loyaltyEarn?: number } }>;
  guestCheckoutReady: boolean;
  hasOutOfStockItems: boolean;
  itemCounts: ConfirmItemCounts;
  receiptEmail: string | null;
  paymentBootstrap: CheckoutPaymentBootstrap;
  shippingCountryCode?: string | undefined;
  deliveryAddress?: CartCheckoutSectionProps['deliveryAddress'];
}) {
  const { status, authedRequest } = useAuthSession();
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const [walletAvailability, setWalletAvailability] = useState(() => paymentBootstrap.walletAvailability);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(
    () => paymentBootstrap.paymentMethods,
  );
  const [sessionMethods, setSessionMethods] = useState<PaymentMethod[]>(
    () => paymentBootstrap.sessionMethods,
  );
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [newCardSelected, setNewCardSelected] = useState(false);
  const [payPalSelected, setPayPalSelected] = useState(false);
  const [bancontactSelected, setBancontactSelected] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletCheckoutMethod | null>(null);
  const [payPalIsDefault, setPayPalIsDefault] = useState(
    () => paymentBootstrap.defaultPaymentMethod?.type === 'paypal',
  );
  const [bancontactIsDefault, setBancontactIsDefault] = useState(
    () => paymentBootstrap.defaultPaymentMethod?.type === 'bancontact',
  );
  const [googlePayIsDefault, setGooglePayIsDefault] = useState(
    () => paymentBootstrap.defaultPaymentMethod?.type === 'google_pay',
  );
  const [applePayIsDefault, setApplePayIsDefault] = useState(
    () => paymentBootstrap.defaultPaymentMethod?.type === 'apple_pay',
  );
  // Guests have no account preference to read (see refreshPaymentMethods'
  // guest branch below) — preference methods stay offered for them, only an
  // authenticated customer's own opt-out (payment-methods page) hides them.
  const [paypalEnabled, setPaypalEnabled] = useState(() => paymentBootstrap.paypalEnabled);
  const [bancontactEnabled, setBancontactEnabled] = useState(() => paymentBootstrap.bancontactEnabled);
  const [googlePayEnabled, setGooglePayEnabled] = useState(() => paymentBootstrap.googlePayEnabled);
  const [applePayEnabled, setApplePayEnabled] = useState(() => paymentBootstrap.applePayEnabled);
  const [newCardEnabled, setNewCardEnabled] = useState(() => paymentBootstrap.newCardEnabled);
  const [shopPaymentMethods, setShopPaymentMethods] = useState(() => paymentBootstrap.shopPaymentMethods);
  const [paymentMethodCountries, setPaymentMethodCountries] = useState<PaymentMethodCountries>(
    () => paymentBootstrap.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES,
  );
  const [countryContext, setCountryContext] = useState<ClientCountryContext>(
    () =>
      paymentBootstrap.countryContext ?? {
        deliveryCountry: null,
        geoCountry: null,
        effectiveCountries: [],
      },
  );
  const [paymentOverflowOpen, setPaymentOverflowOpen] = useState(false);
  const [promotedPaymentKeys, setPromotedPaymentKeys] = useState<ReadonlySet<PaymentOverflowKey>>(
    () => new Set(),
  );
  const appliedPaymentRevisionRef = useRef(paymentBootstrap.revision);

  const promotePaymentKey = useCallback((key: PaymentOverflowKey) => {
    setPromotedPaymentKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void authApi
      .getShopPaymentMethods(shippingCountryCode)
      .then((result) => {
        if (cancelled) return;
        setShopPaymentMethods(result.shopPaymentMethods);
        setPaymentMethodCountries(result.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES);
        setCountryContext(result.countryContext);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shippingCountryCode]);

  const effectiveCountries = liveEffectiveCountries(
    shippingCountryCode,
    countryContext.geoCountry,
    countryContext.effectiveCountries,
  );

  // Same as CartPage's courier overflow effect: a persisted overflow pick
  // (PayPal, Bancontact, wallets — not a saved card pm_…) stays visible in
  // the primary list after refresh for this cart session.
  useEffect(() => {
    if (!selectedPaymentMethodId) return;
    const key = paymentOverflowKeyForSelection(
      selectedPaymentMethodId,
      shopPaymentMethods,
      { paypalEnabled, bancontactEnabled, googlePayEnabled, applePayEnabled, newCardEnabled },
      walletAvailability,
      paymentMethodCountries,
      effectiveCountries,
    );
    if (key && key !== 'card') promotePaymentKey(key);
  }, [
    selectedPaymentMethodId,
    shopPaymentMethods,
    paypalEnabled,
    bancontactEnabled,
    googlePayEnabled,
    applePayEnabled,
    newCardEnabled,
    walletAvailability,
    paymentMethodCountries,
    effectiveCountries,
    promotePaymentKey,
  ]);

  // Silent cart revalidate: refresh lists/prefs/wallets without remounting.
  useEffect(() => {
    if (appliedPaymentRevisionRef.current === paymentBootstrap.revision) return;
    appliedPaymentRevisionRef.current = paymentBootstrap.revision;
    setPaymentMethods(paymentBootstrap.paymentMethods);
    setSessionMethods(paymentBootstrap.sessionMethods);
    setPaypalEnabled(paymentBootstrap.paypalEnabled);
    setBancontactEnabled(paymentBootstrap.bancontactEnabled);
    setGooglePayEnabled(paymentBootstrap.googlePayEnabled);
    setApplePayEnabled(paymentBootstrap.applePayEnabled);
    setNewCardEnabled(paymentBootstrap.newCardEnabled);
    setShopPaymentMethods(paymentBootstrap.shopPaymentMethods);
    setPaymentMethodCountries(paymentBootstrap.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES);
    setCountryContext(
      paymentBootstrap.countryContext ?? {
        deliveryCountry: null,
        geoCountry: null,
        effectiveCountries: [],
      },
    );
    setPayPalIsDefault(paymentBootstrap.defaultPaymentMethod?.type === 'paypal');
    setBancontactIsDefault(paymentBootstrap.defaultPaymentMethod?.type === 'bancontact');
    setGooglePayIsDefault(paymentBootstrap.defaultPaymentMethod?.type === 'google_pay');
    setApplePayIsDefault(paymentBootstrap.defaultPaymentMethod?.type === 'apple_pay');
    setWalletAvailability(paymentBootstrap.walletAvailability);
  }, [paymentBootstrap]);
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [cardPaymentConfirmOpen, setCardPaymentConfirmOpen] = useState(false);
  const [newCardPaymentConfirmOpen, setNewCardPaymentConfirmOpen] = useState(false);
  const [payPalPaymentConfirmOpen, setPayPalPaymentConfirmOpen] = useState(false);
  const [bancontactPaymentConfirmOpen, setBancontactPaymentConfirmOpen] = useState(false);
  const [walletPaymentConfirmOpen, setWalletPaymentConfirmOpen] = useState(false);
  const [preparedCardIntent, setPreparedCardIntent] = useState<PreparedPaymentIntent | null>(null);
  const [preparedNewCardIntent, setPreparedNewCardIntent] = useState<PreparedPaymentIntent | null>(null);
  const [preparedPayPalIntent, setPreparedPayPalIntent] = useState<PreparedPaymentIntent | null>(null);
  const [preparedBancontactIntent, setPreparedBancontactIntent] = useState<PreparedPaymentIntent | null>(
    null,
  );
  const [preparedWalletIntent, setPreparedWalletIntent] = useState<PreparedPaymentIntent | null>(null);
  const defaultAppliedRef = useRef(true);
  // Refreshing the saved-card list must never silently replace an already
  // selected PayPal/Bancontact default with its first card. Keep this outside the
  // asynchronous loader's render closure so a second refresh cannot race
  // that initial default selection.
  const payPalSelectedRef = useRef(false);
  const bancontactSelectedRef = useRef(false);
  const newCardSelectedRef = useRef(false);
  const selectedWalletRef = useRef<WalletCheckoutMethod | null>(null);
  useEffect(() => {
    payPalSelectedRef.current = payPalSelected;
  }, [payPalSelected]);
  useEffect(() => {
    newCardSelectedRef.current = newCardSelected;
  }, [newCardSelected]);
  useEffect(() => {
    bancontactSelectedRef.current = bancontactSelected;
  }, [bancontactSelected]);
  useEffect(() => {
    selectedWalletRef.current = selectedWallet;
  }, [selectedWallet]);

  // A one-time card must not become the account default, but it remains the
  // active method for this checkout after a guest cart is reconciled.
  useEffect(() => {
    if (!selectedPaymentMethodId) return;
    const stillValid = isSelectedPaymentMethodStillValid(
      selectedPaymentMethodId,
      shopPaymentMethods,
      { paypalEnabled, bancontactEnabled, googlePayEnabled, applePayEnabled, newCardEnabled },
      walletAvailability,
      paymentMethodCountries,
      effectiveCountries,
    );
    if (!stillValid) {
      onPaymentMethodChange(null);
      return;
    }
    if (selectedPaymentMethodId === 'paypal') {
      setSelectedCardId(null);
      setNewCardSelected(false);
      newCardSelectedRef.current = false;
      setSelectedWallet(null);
      selectedWalletRef.current = null;
      bancontactSelectedRef.current = false;
      setBancontactSelected(false);
      payPalSelectedRef.current = true;
      setPayPalSelected(true);
      return;
    }
    if (selectedPaymentMethodId === 'bancontact') {
      setSelectedCardId(null);
      setNewCardSelected(false);
      newCardSelectedRef.current = false;
      setSelectedWallet(null);
      selectedWalletRef.current = null;
      payPalSelectedRef.current = false;
      setPayPalSelected(false);
      bancontactSelectedRef.current = true;
      setBancontactSelected(true);
      return;
    }
    if (selectedPaymentMethodId === 'new_card') {
      setSelectedCardId(null);
      setSelectedWallet(null);
      selectedWalletRef.current = null;
      payPalSelectedRef.current = false;
      setPayPalSelected(false);
      bancontactSelectedRef.current = false;
      setBancontactSelected(false);
      newCardSelectedRef.current = true;
      setNewCardSelected(true);
      return;
    }
    if (isWalletCheckoutMethod(selectedPaymentMethodId)) {
      if (!walletAvailability.ready) return;
      setSelectedCardId(null);
      setNewCardSelected(false);
      newCardSelectedRef.current = false;
      payPalSelectedRef.current = false;
      setPayPalSelected(false);
      bancontactSelectedRef.current = false;
      setBancontactSelected(false);
      selectedWalletRef.current = selectedPaymentMethodId;
      setSelectedWallet(selectedPaymentMethodId);
      return;
    }
    const hasSelectedMethod = [...paymentMethods, ...sessionMethods].some(
      (method) => method.id === selectedPaymentMethodId,
    );
    if (!hasSelectedMethod) return;
    setSelectedCardId(selectedPaymentMethodId);
    setNewCardSelected(false);
    newCardSelectedRef.current = false;
    payPalSelectedRef.current = false;
    setPayPalSelected(false);
    bancontactSelectedRef.current = false;
    setBancontactSelected(false);
    setSelectedWallet(null);
    selectedWalletRef.current = null;
  }, [
    paymentMethods,
    paypalEnabled,
    bancontactEnabled,
    newCardEnabled,
    selectedPaymentMethodId,
    sessionMethods,
    walletAvailability,
    googlePayEnabled,
    applePayEnabled,
    shopPaymentMethods,
    paymentMethodCountries,
    effectiveCountries,
    onPaymentMethodChange,
  ]);

  // Signed-out branch reads/writes state/guestCardVault.ts (encrypted,
  // in-memory-only key — see its own doc comment) instead of the account —
  // same shape (PaymentMethod[]/DefaultPaymentMethod) as the authenticated
  // response below, so this list renders identically either way (see the
  // user's own note: it must look and behave the same, not a stripped-down
  // substitute). state/guestSync.ts attaches these to the real customer on
  // login.
  const refreshPaymentMethods = useCallback(async () => {
    if (status === 'anonymous') {
      const [guestCards, shopResult] = await Promise.all([
        loadGuestCards(),
        authApi.getShopPaymentMethods(shippingCountryCode).catch(() => ({
          shopPaymentMethods: {
            card: false,
            paypal: false,
            bancontact: false,
            googlePay: false,
            applePay: false,
          },
          paymentMethodCountries: EMPTY_PAYMENT_METHOD_COUNTRIES,
          countryContext: {
            deliveryCountry: shippingCountryCode?.toUpperCase() ?? null,
            geoCountry: null,
            effectiveCountries: shippingCountryCode ? [shippingCountryCode.toUpperCase()] : [],
          },
        })),
      ]);
      setShopPaymentMethods(shopResult.shopPaymentMethods);
      // Guest vault may still hold one-time cards for attach-on-login; the
      // reusable list only shows remembered ones. Session ephemeral covers
      // the current checkout one-time selection.
      const saved = guestCards.paymentMethods.filter((m) => m.savedForFuture !== false);
      setPaymentMethods(saved);
      setSessionMethods(loadEphemeralCards());
      setLoadingMethods(false);
      const def = guestCards.defaultPaymentMethod;
      setPayPalIsDefault(def?.type === 'paypal' && shopResult.shopPaymentMethods.paypal);
      setBancontactIsDefault(def?.type === 'bancontact' && shopResult.shopPaymentMethods.bancontact);
      setGooglePayIsDefault(def?.type === 'google_pay' && shopResult.shopPaymentMethods.googlePay);
      setApplePayIsDefault(def?.type === 'apple_pay' && shopResult.shopPaymentMethods.applePay);
      const defaultCardId = def?.type === 'card' ? def.id : null;
      if (!defaultAppliedRef.current && def?.type === 'paypal') {
        setSelectedCardId(null);
        setSelectedWallet(null);
        selectedWalletRef.current = null;
        bancontactSelectedRef.current = false;
        setBancontactSelected(false);
        payPalSelectedRef.current = true;
        setPayPalSelected(true);
      } else if (!defaultAppliedRef.current && def?.type === 'bancontact') {
        setSelectedCardId(null);
        setSelectedWallet(null);
        selectedWalletRef.current = null;
        payPalSelectedRef.current = false;
        setPayPalSelected(false);
        bancontactSelectedRef.current = true;
        setBancontactSelected(true);
      } else if (!defaultAppliedRef.current && (def?.type === 'google_pay' || def?.type === 'apple_pay')) {
        // Hand off to the selectedPaymentMethodId restore effect, which waits
        // for canMakePayment before selecting (or clears if unavailable).
        onPaymentMethodChange(def.type);
      } else {
        setSelectedCardId((current) => {
          if (
            payPalSelectedRef.current ||
            bancontactSelectedRef.current ||
            newCardSelectedRef.current ||
            selectedWalletRef.current
          )
            return null;
          if (current) return current;
          // Only an explicit default pre-selects a card — no fallback to
          // "first saved card" when nothing was ever actually marked
          // default; the customer must choose.
          if (defaultCardId && guestCards.paymentMethods.some((method) => method.id === defaultCardId)) {
            return defaultCardId;
          }
          return null;
        });
      }
      defaultAppliedRef.current = true;
      return;
    }
    const result = await authedRequest((token) => authApi.listPaymentMethods(token));
    setPaymentMethods(result.paymentMethods);
    let ephemeral = loadEphemeralCards();
    // One-time cards are omitted from listPaymentMethods. Always re-check a
    // selected one with the backend: a memory cache is never authority, and
    // a card may have become one_time_consumed in another tab while this page
    // remained mounted.
    const selectedId = selectedPaymentMethodId;
    if (
      selectedId &&
      selectedId !== 'paypal' &&
      selectedId !== 'bancontact' &&
      !isWalletCheckoutMethod(selectedId) &&
      !result.paymentMethods.some((m) => m.id === selectedId)
    ) {
      const hydrated = await authedRequest((token) => authApi.getPaymentMethod(token, selectedId)).catch(
        () => null,
      );
      if (hydrated?.paymentMethod) {
        ephemeral = addEphemeralCard(hydrated.paymentMethod);
      } else {
        ephemeral = removeEphemeralCard(selectedId);
        onPaymentMethodChange(null);
      }
    }
    setSessionMethods(ephemeral);
    setLoadingMethods(false);
    setPaypalEnabled(result.paypalEnabled);
    setBancontactEnabled(result.bancontactEnabled);
    setGooglePayEnabled(result.googlePayEnabled);
    setApplePayEnabled(result.applePayEnabled);
    setNewCardEnabled(result.newCardEnabled);
    setShopPaymentMethods(result.shopPaymentMethods);
    setPayPalIsDefault(result.defaultPaymentMethod?.type === 'paypal');
    setBancontactIsDefault(result.defaultPaymentMethod?.type === 'bancontact');
    setGooglePayIsDefault(result.defaultPaymentMethod?.type === 'google_pay');
    setApplePayIsDefault(result.defaultPaymentMethod?.type === 'apple_pay');
    const defaultCardId =
      result.defaultPaymentMethod?.type === 'card' ? result.defaultPaymentMethod.id : null;
    // Disabling a preference already clears it as the stored default
    // server-side (see PUT .../*-enabled), so a disabled method never
    // arrives here as defaultPaymentMethod.
    if (!defaultAppliedRef.current && result.defaultPaymentMethod?.type === 'paypal') {
      setSelectedCardId(null);
      setSelectedWallet(null);
      selectedWalletRef.current = null;
      bancontactSelectedRef.current = false;
      setBancontactSelected(false);
      payPalSelectedRef.current = true;
      setPayPalSelected(true);
    } else if (!defaultAppliedRef.current && result.defaultPaymentMethod?.type === 'bancontact') {
      setSelectedCardId(null);
      setSelectedWallet(null);
      selectedWalletRef.current = null;
      payPalSelectedRef.current = false;
      setPayPalSelected(false);
      bancontactSelectedRef.current = true;
      setBancontactSelected(true);
    } else if (
      !defaultAppliedRef.current &&
      (result.defaultPaymentMethod?.type === 'google_pay' ||
        result.defaultPaymentMethod?.type === 'apple_pay')
    ) {
      const walletDefault = result.defaultPaymentMethod.type;
      const shopOn =
        walletDefault === 'google_pay'
          ? result.shopPaymentMethods.googlePay
          : result.shopPaymentMethods.applePay;
      const enabled = walletDefault === 'google_pay' ? result.googlePayEnabled : result.applePayEnabled;
      if (shopOn && enabled) onPaymentMethodChange(walletDefault);
    } else {
      setSelectedCardId((current) => {
        if (payPalSelectedRef.current || bancontactSelectedRef.current || selectedWalletRef.current)
          return null;
        if (current) return current;
        // Only an explicit default pre-selects a card — no fallback to
        // "first saved card" when nothing was ever actually marked
        // default; the customer must choose.
        if (defaultCardId && result.paymentMethods.some((method) => method.id === defaultCardId)) {
          return defaultCardId;
        }
        return null;
      });
    }
    defaultAppliedRef.current = true;
  }, [status, authedRequest, selectedPaymentMethodId, onPaymentMethodChange, shippingCountryCode]);

  // Cart radio selection is for this checkout only. The account (or guest)
  // default payment method is managed on the payment-methods page — do not
  // rewrite it (or move the "Défaut" badge) on every switch here. Cart
  // selection is already persisted via onPaymentMethodChange / cart selection.
  function handleSelectCard(id: string) {
    setSelectedCardId(id);
    newCardSelectedRef.current = false;
    setNewCardSelected(false);
    payPalSelectedRef.current = false;
    setPayPalSelected(false);
    bancontactSelectedRef.current = false;
    setBancontactSelected(false);
    setSelectedWallet(null);
    selectedWalletRef.current = null;
    setError(null);
    onPaymentMethodChange(id);
  }

  function handleSelectNewCard() {
    setSelectedCardId(null);
    setSelectedWallet(null);
    selectedWalletRef.current = null;
    payPalSelectedRef.current = false;
    setPayPalSelected(false);
    bancontactSelectedRef.current = false;
    setBancontactSelected(false);
    newCardSelectedRef.current = true;
    setNewCardSelected(true);
    setError(null);
    onPaymentMethodChange('new_card');
  }

  function handleSelectPayPal() {
    setSelectedCardId(null);
    newCardSelectedRef.current = false;
    setNewCardSelected(false);
    setSelectedWallet(null);
    selectedWalletRef.current = null;
    bancontactSelectedRef.current = false;
    setBancontactSelected(false);
    payPalSelectedRef.current = true;
    setPayPalSelected(true);
    setError(null);
    onPaymentMethodChange('paypal');
  }

  function handleSelectBancontact() {
    setSelectedCardId(null);
    newCardSelectedRef.current = false;
    setNewCardSelected(false);
    setSelectedWallet(null);
    selectedWalletRef.current = null;
    payPalSelectedRef.current = false;
    setPayPalSelected(false);
    bancontactSelectedRef.current = true;
    setBancontactSelected(true);
    setError(null);
    onPaymentMethodChange('bancontact');
  }

  function handleSelectWallet(method: WalletCheckoutMethod) {
    setSelectedCardId(null);
    newCardSelectedRef.current = false;
    setNewCardSelected(false);
    payPalSelectedRef.current = false;
    setPayPalSelected(false);
    bancontactSelectedRef.current = false;
    setBancontactSelected(false);
    selectedWalletRef.current = method;
    setSelectedWallet(method);
    setError(null);
    onPaymentMethodChange(method);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Defense in depth against a real class of bug: a portal-rendered
    // modal (AddCardModal) nested anywhere in this form's React subtree has
    // its own <form>, and React bubbles synthetic events through the React
    // tree — not the DOM tree a portal actually renders into — so without
    // this guard, submitting *that* form would charge whatever card is
    // selected *here* too, in the same tick (see AddCardModal's own
    // stopPropagation fix, which is the primary fix; this is the backstop
    // in case some other nested form is ever added without it).
    if (e.target !== e.currentTarget) return;
    setError(null);

    // Charging works while signed out too, once GuestCheckoutPrompt's own
    // email + consent are ready (guestCheckoutReady) — canSubmit already
    // requires that, so this is only a defensive no-op for the case where
    // it somehow isn't (never reachable via a real click on the disabled
    // button).
    if (status === 'anonymous' && !guestCheckoutReady) return;

    if (isFreeOrder) {
      setSubmitting(true);
      try {
        const { order } = await withTimeout(
          withMinDuration(onCompleteFreeOrder(), shopConfig.loadingMinMs.short),
          shopConfig.paymentTimeoutMs,
        );
        // Same cleanup as a paid success (ephemeral cards/addresses, guest
        // cart) — a free (100%-off) order is still a completed order.
        handlePaymentSuccess(order.orderNumber, order.loyaltyEarn);
        setSubmitting(false);
      } catch {
        setError(t.cart.paymentErrorGeneric);
        setSubmitting(false);
      }
      return;
    }

    if (
      !deliveryReady ||
      (!payPalSelected &&
        !bancontactSelected &&
        !selectedWallet &&
        !newCardSelected &&
        !selectedCardId)
    )
      return;
    setPreparingPayment(true);
    setReservationError(null);
    try {
      const prepared = await withTimeout(
        withMinDuration(
          payPalSelected
            ? onCreatePayPalIntent()
            : bancontactSelected
              ? onCreateBancontactIntent()
              : selectedWallet
                ? onCreateWalletIntent(selectedWallet)
                : newCardSelected
                  ? onCreateNewCardIntent()
                  : onCreateCardIntent(selectedCardId!),
          shopConfig.loadingMinMs.short,
        ),
        shopConfig.paymentTimeoutMs,
      );
      if (payPalSelected) {
        setPreparedPayPalIntent(prepared);
        setPayPalPaymentConfirmOpen(true);
      } else if (bancontactSelected) {
        setPreparedBancontactIntent(prepared);
        setBancontactPaymentConfirmOpen(true);
      } else if (selectedWallet) {
        setPreparedWalletIntent(prepared);
        setWalletPaymentConfirmOpen(true);
      } else if (newCardSelected) {
        setPreparedNewCardIntent(prepared);
        setNewCardPaymentConfirmOpen(true);
      } else {
        setPreparedCardIntent(prepared);
        setCardPaymentConfirmOpen(true);
      }
    } catch (reservationFailure) {
      const message = mapCheckoutErrorMessage(reservationFailure, t);
      setReservationError(message || t.cart.errorGeneric);
    } finally {
      setPreparingPayment(false);
    }
  }


  function handleDeleteCard(id: string) {
    if (sessionMethods.some((method) => method.id === id)) {
      markCheckoutEntityDeleted(id);
      setSessionMethods(removeEphemeralCard(id));
      setSelectedCardId((current) => {
        if (current !== id) return current;
        onPaymentMethodChange(null);
        return null;
      });
      return;
    }
    setPendingDeleteCardId(id);
  }

  async function confirmDeleteCard() {
    if (!pendingDeleteCardId) return;
    const id = pendingDeleteCardId;
    setPendingDeleteCardId(null);
    if (status === 'anonymous') {
      const current = await loadGuestCards();
      const next = current.paymentMethods.filter((method) => method.id !== id);
      const nextDefault =
        current.defaultPaymentMethod?.type === 'card' && current.defaultPaymentMethod.id === id
          ? null
          : current.defaultPaymentMethod;
      await saveGuestCards({ paymentMethods: next, defaultPaymentMethod: nextDefault });
      markCheckoutEntityDeleted(id);
      setPaymentMethods(next);
      setSelectedCardId((current) => {
        if (current !== id) return current;
        onPaymentMethodChange(null);
        return null;
      });
      return;
    }
    await authedRequest((token) => authApi.deletePaymentMethod(token, id));
    markCheckoutEntityDeleted(id);
    setSelectedCardId((current) => {
      if (current !== id) return current;
      onPaymentMethodChange(null);
      return null;
    });
    await refreshPaymentMethods();
  }

  // Delivery + payment method work the same whether signed in or not (see
  // handleSubmit's own comment). Charging itself needs either a real
  // account or a valid guest email + accepted consent (GuestCheckoutPrompt's
  // card, mirrored up to CartPage as guestCheckoutReady) — canSubmit (what
  // actually enables the "Payer" button, via onStateChange below) reflects
  // whichever applies. The button must never be the thing that tells an
  // anonymous customer what's missing; GuestCheckoutPrompt is the single,
  // clearly placed prompt for that. Having a second warning inside the
  // payment-method block was confusing because payment selection itself
  // remains available to guests either way.
  const deliveryAndPaymentReady =
    isFreeOrder ||
    (deliveryReady &&
      (payPalSelected ||
        bancontactSelected ||
        selectedWallet !== null ||
        newCardSelected ||
        selectedCardId !== null));
  const canSubmit =
    deliveryAndPaymentReady && (status === 'authenticated' || (status === 'anonymous' && guestCheckoutReady));
  // Address and shipping-method guidance for this same "below total" spot
  // live in CartPage (this component only ever mounts once both are
  // already resolved), so payment method is the one thing left to guide
  // here, in the same priority-ordered spirit.
  const missingPaymentMethodNotice =
    !loadingMethods &&
    !payPalSelected &&
    !bancontactSelected &&
    !selectedWallet &&
    !newCardSelected &&
    !selectedCardId
      ? t.cart.errorPaymentMethodRequired
      : null;

  const visibleMethods = useMemo(
    () => [
      ...paymentMethods,
      ...sessionMethods.filter((session) => !paymentMethods.some((saved) => saved.id === session.id)),
    ],
    [paymentMethods, sessionMethods],
  );

  const pendingDeleteCard = pendingDeleteCardId
    ? visibleMethods.find((pm) => pm.id === pendingDeleteCardId)
    : undefined;
  const pendingDeleteBrand = pendingDeleteCard
    ? (BRAND_LABELS[pendingDeleteCard.brand] ?? pendingDeleteCard.brand)
    : '';
  const pendingDeleteCardLine = pendingDeleteCard
    ? `${pendingDeleteBrand} •••• ${pendingDeleteCard.last4}`
    : '';
  const pendingDeleteMessage = pendingDeleteCard ? (
    <div className={styles.deletePreview}>
      {pendingDeleteCard.cardholderName && (
        <div className={styles.deletePreviewName}>{pendingDeleteCard.cardholderName}</div>
      )}
      <div className={pendingDeleteCard.cardholderName ? undefined : styles.deletePreviewName}>
        {pendingDeleteCardLine}
      </div>
      <div>
        {t.paymentMethods.expiresLabel} {String(pendingDeleteCard.expMonth).padStart(2, '0')}/
        {pendingDeleteCard.expYear}
      </div>
    </div>
  ) : null;

  function handlePaymentSuccess(orderNumber: string, loyaltyEarn?: number | null) {
    // A one-time card is valid only for the checkout that just completed.
    // Clear the persisted cart selection too, otherwise a remount can use
    // its id to hydrate the intentionally hidden Stripe method again.
    if (status === 'anonymous') {
      setSelectedCardId(null);
      onPaymentMethodChange(null);
    } else if (selectedCardId && sessionMethods.some((method) => method.id === selectedCardId)) {
      setSelectedCardId(null);
      onPaymentMethodChange(null);
    }
    clearEphemeralCards();
    clearEphemeralAddresses();
    // A guest's cart lives only in localStorage (see guestCart.ts) — the
    // order that just succeeded is what matters from here, not the
    // selection that led to it, so it shouldn't still be sitting in /cart
    // as if nothing happened.
    if (status === 'anonymous') {
      setPaymentMethods([]);
      void clearGuestCheckoutAfterOrder();
    }
    setSessionMethods([]);
    setPromotedPaymentKeys(new Set());
    onSuccess(orderNumber, loyaltyEarn);
  }

  const paymentOverflowOptions = useMemo(
    () =>
      buildPaymentOverflowOptions(
        t,
        shopPaymentMethods,
        paymentMethodCountries,
        effectiveCountries,
        walletAvailability,
        googlePayEnabled,
        applePayEnabled,
        paypalEnabled,
        bancontactEnabled,
        newCardEnabled,
        loadingMethods,
        visibleMethods,
        promotedPaymentKeys,
      ),
    [
      t,
      shopPaymentMethods,
      paymentMethodCountries,
      effectiveCountries,
      walletAvailability,
      googlePayEnabled,
      applePayEnabled,
      paypalEnabled,
      bancontactEnabled,
      newCardEnabled,
      loadingMethods,
      visibleMethods,
      promotedPaymentKeys,
    ],
  );

  const showPaymentOverflowLink = paymentOverflowOptions.length > 0;

  function handleOverflowPaymentPick(id: string) {
    setPaymentOverflowOpen(false);
    if (id === 'paypal') {
      promotePaymentKey('paypal');
      handleSelectPayPal();
      return;
    }
    if (id === 'bancontact') {
      promotePaymentKey('bancontact');
      handleSelectBancontact();
      return;
    }
    if (id === 'google_pay') {
      promotePaymentKey('google_pay');
      handleSelectWallet('google_pay');
      return;
    }
    if (id === 'apple_pay') {
      promotePaymentKey('apple_pay');
      handleSelectWallet('apple_pay');
      return;
    }
    if (id === 'new_card') {
      promotePaymentKey('new_card');
      handleSelectNewCard();
      return;
    }
    if (id === 'card') {
      promotePaymentKey('card');
      const first = visibleMethods[0];
      if (first) handleSelectCard(first.id);
    }
  }

  // The actual "Payer" button lives in the cart's sticky summary sidebar
  // (see formId's doc comment on CartCheckoutSectionProps) — this is how it
  // learns whether to enable itself, without any Stripe state living there.
  useEffect(() => {
    onStateChangeRef.current({ canSubmit, submitting, error });
  }, [canSubmit, submitting, error]);

  return (
    <form id={formId} onSubmit={handleSubmit} className={styles.section} noValidate>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>{t.cart.paymentModalTitle}</h2>
        {!isFreeOrder &&
          !bancontactSelected &&
          (payPalSelected ||
            selectedWallet !== null ||
            newCardSelected ||
            selectedCardId !== null) && (
            <p className={styles.headingNotice}>{t.cart.paymentChargedOnPreparation}</p>
          )}
      </div>

      <CheckoutPaymentMethodList
        t={t}
        shopPaymentMethods={shopPaymentMethods}
        paymentMethodCountries={paymentMethodCountries}
        effectiveCountries={effectiveCountries}
        promotedKeys={promotedPaymentKeys}
        walletAvailability={walletAvailability}
        googlePayEnabled={googlePayEnabled}
        applePayEnabled={applePayEnabled}
        paypalEnabled={paypalEnabled}
        bancontactEnabled={bancontactEnabled}
        newCardEnabled={newCardEnabled}
        googlePayIsDefault={googlePayIsDefault}
        applePayIsDefault={applePayIsDefault}
        payPalIsDefault={payPalIsDefault}
        bancontactIsDefault={bancontactIsDefault}
        selectedWallet={selectedWallet}
        payPalSelected={payPalSelected}
        bancontactSelected={bancontactSelected}
        newCardSelected={newCardSelected}
        selectedCardId={selectedCardId}
        loadingMethods={loadingMethods}
        visibleMethods={visibleMethods}
        onSelectWallet={handleSelectWallet}
        onSelectPayPal={handleSelectPayPal}
        onSelectBancontact={handleSelectBancontact}
        onSelectNewCard={handleSelectNewCard}
        onSelectCard={handleSelectCard}
        onDeleteCard={handleDeleteCard}
      />
      {paymentOverflowOpen && (
        <CheckoutOverflowPickerModal
          title={t.cart.overflowModalPaymentTitle}
          closeLabel={t.gallery.close}
          options={paymentOverflowOptions}
          onSelect={handleOverflowPaymentPick}
          onClose={() => setPaymentOverflowOpen(false)}
        />
      )}

      {!error && missingPaymentMethodNotice && <p className={styles.notice}>{missingPaymentMethodNotice}</p>}
      <CheckoutOverflowMoreLink
        t={t}
        visible={showPaymentOverflowLink}
        onOpen={() => setPaymentOverflowOpen(true)}
      />
      {pendingDeleteCardId && pendingDeleteCard && (
        <ConfirmModal
          variant="dialog"
          title={t.paymentMethods.deleteConfirm}
          message={pendingDeleteMessage}
          confirmLabel={t.paymentMethods.deleteButton}
          closeLabel={t.auth.closeAria}
          confirmDanger
          onConfirm={() => void confirmDeleteCard()}
          onCancel={() => setPendingDeleteCardId(null)}
        />
      )}
      {reservationError && (
        <ConfirmModal
          variant="dialog"
          title={t.cart.checkoutReservationErrorTitle}
          message={reservationError}
          confirmLabel={t.auth.closeAria}
          closeLabel={t.auth.closeAria}
          onConfirm={() => setReservationError(null)}
          onCancel={() => setReservationError(null)}
        />
      )}
      {cardPaymentConfirmOpen &&
        selectedCardId &&
        preparedCardIntent &&
        (() => {
          const card = visibleMethods.find((pm) => pm.id === selectedCardId);
          if (!card) return null;
          return (
            <CardPaymentConfirmDialog
              t={t}
              card={card}
              total={total}
              paymentIntent={preparedCardIntent}
              paymentMethodId={selectedCardId}
              onCancel={() => {
                setCardPaymentConfirmOpen(false);
                setPreparedCardIntent(null);
              }}
              onSuccess={handlePaymentSuccess}
              onError={(message) => setError(message)}
              onSubmittingChange={setSubmitting}
              hasOutOfStockItems={hasOutOfStockItems}
              itemCounts={itemCounts}
              receiptEmail={receiptEmail}
              deliveryAddress={deliveryAddress}
            />
          );
        })()}
      {newCardPaymentConfirmOpen && preparedNewCardIntent && (
        <NewCardPaymentConfirmDialog
          t={t}
          total={total}
          paymentIntent={preparedNewCardIntent}
          onCancel={() => {
            setNewCardPaymentConfirmOpen(false);
            setPreparedNewCardIntent(null);
          }}
          onSuccess={handlePaymentSuccess}
          onError={(message) => setError(message)}
          onSubmittingChange={setSubmitting}
          hasOutOfStockItems={hasOutOfStockItems}
          itemCounts={itemCounts}
          receiptEmail={receiptEmail}
          deliveryAddress={deliveryAddress}
        />
      )}
      {payPalPaymentConfirmOpen && preparedPayPalIntent && (
        <RedirectPaymentConfirmDialog
          t={t}
          method="paypal"
          total={total}
          paymentIntent={preparedPayPalIntent}
          onSuccess={handlePaymentSuccess}
          onError={(message) => setError(message)}
          onSubmittingChange={setSubmitting}
          onCancel={() => {
            setPayPalPaymentConfirmOpen(false);
            setPreparedPayPalIntent(null);
          }}
          hasOutOfStockItems={hasOutOfStockItems}
          itemCounts={itemCounts}
          receiptEmail={receiptEmail}
          deliveryAddress={deliveryAddress}
        />
      )}
      {bancontactPaymentConfirmOpen && preparedBancontactIntent && (
        <RedirectPaymentConfirmDialog
          t={t}
          method="bancontact"
          total={total}
          paymentIntent={preparedBancontactIntent}
          onSuccess={handlePaymentSuccess}
          onError={(message) => setError(message)}
          onSubmittingChange={setSubmitting}
          onCancel={() => {
            setBancontactPaymentConfirmOpen(false);
            setPreparedBancontactIntent(null);
          }}
          hasOutOfStockItems={hasOutOfStockItems}
          itemCounts={itemCounts}
          receiptEmail={receiptEmail}
          deliveryAddress={deliveryAddress}
        />
      )}
      {walletPaymentConfirmOpen && preparedWalletIntent && selectedWallet && (
        <WalletPaymentConfirmDialog
          t={t}
          method={selectedWallet}
          total={total}
          paymentIntent={preparedWalletIntent}
          onSuccess={handlePaymentSuccess}
          onError={(message) => setError(message)}
          onSubmittingChange={setSubmitting}
          onCancel={() => {
            setWalletPaymentConfirmOpen(false);
            setPreparedWalletIntent(null);
          }}
          hasOutOfStockItems={hasOutOfStockItems}
          itemCounts={itemCounts}
          receiptEmail={receiptEmail}
          deliveryAddress={deliveryAddress}
        />
      )}
      {preparingPayment && <LoadingModal message={t.cart.checkoutReservationLoading} />}
      {submitting && isFreeOrder && <LoadingModal message={t.cart.payingButton} />}
    </form>
  );
}

import { CardPaymentConfirmDialog } from './checkoutCardConfirmation';
import { NewCardPaymentConfirmDialog } from './checkoutNewCardConfirmation';
import { RedirectPaymentConfirmDialog } from './checkoutRedirectConfirmation';
import { WalletPaymentConfirmDialog } from './checkoutWalletConfirmation';
