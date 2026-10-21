import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { localizedPath } from '../../config/i18nRoutes';
import { shopConfig } from '../../config/env';
import * as accountApi from '../../api/account';
import * as authApi from '../../api/checkout';
import { type Address, type AddressInput, type Country, type Courier } from '../../api/account';
import type { PickupPoint } from '../../components/address/pickupPoint';
import { buildCourierOverflowOptions } from '../../components/cart/CartCourierSection';
import {
  buildEffectiveCountries,
  courierOverflowTier,
  isCheckoutPaymentPreferenceSentinel,
  isSelectedPaymentMethodStillValid,
  liveEffectiveCountries,
} from '../../utils/checkoutOverflow';
import { EMPTY_PAYMENT_METHOD_COUNTRIES } from '../../state/cartPaymentBootstrap';
import { courierCompatible, courierMatch } from '../../utils/courierMatch';
import { pickCourierTier } from '../../utils/courierPricing';
import { normalizeGuestAddress, saveGuestState } from '../../state/guestCart';
import { saveGuestAddressState } from '../../state/guestCardVault';
import { markCheckoutEntityDeleted } from '../../state/cartBootstrapCache';
import {
  addEphemeralAddress,
  mergeAddressLists,
  removeEphemeralAddress,
} from '../../state/ephemeralAddresses';
import type { GiftSummary } from '../../api/gift';
import type { useCartPageBootstrap } from '../../hooks/useCartPageBootstrap';
import type { Lang } from '../../assets/i18n/types';

type Boot = ReturnType<typeof useCartPageBootstrap>;
type AuthedRequest = <T>(fn: (token: string) => Promise<T>) => Promise<T>;

export function useShopCartDelivery(args: {
  boot: Boot;
  status: string;
  lang: Lang;
  authedRequest: AuthedRequest;
  isGiftCart: boolean;
  giftSummary: GiftSummary | null;
  totalQuantity: number;
  paymentMethodId: string | null;
  setPaymentMethodId: Dispatch<SetStateAction<string | null>>;
  promoCode: string;
  setPromoCode: Dispatch<SetStateAction<string>>;
  applyLoyalty: boolean;
  setApplyLoyalty: Dispatch<SetStateAction<boolean>>;
  appliedVoucherCode: string | null | undefined;
}) {
  const {
    boot,
    status,
    lang,
    authedRequest,
    isGiftCart,
    giftSummary,
    totalQuantity,
    paymentMethodId,
    setPaymentMethodId,
    promoCode,
    setPromoCode,
    applyLoyalty,
    setApplyLoyalty,
    appliedVoucherCode,
  } = args;

  const navigate = useNavigate();
  const location = useLocation();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [pickupAddressInitial, setPickupAddressInitial] = useState<Partial<Address> | undefined>();
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [pendingDeleteAddressId, setPendingDeleteAddressId] = useState<string | null>(null);
  // "Use the same address for facturation". Default-checked unless the
  // customer already has a default facturation address (see delivery bootstrap).
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [billingAddressId, setBillingAddressId] = useState<string | null>(null);
  const [addBillingAddressOpen, setAddBillingAddressOpen] = useState(false);
  const [editingBillingAddress, setEditingBillingAddress] = useState<Address | null>(null);
  const livraisonAddresses = useMemo(() => {
    const saved = addresses.filter((a) => a.kind === 'livraison');
    const dest = giftSummary?.destination;
    if (!isGiftCart || !dest) return saved;
    const id = addressId ?? 'gift-destination';
    if (saved.some((row) => row.id === id || row.line1 === dest.line1)) return saved;
    return [
      {
        id,
        kind: 'livraison' as const,
        label: null,
        recipientName: dest.recipientName,
        companyName: dest.companyName,
        line1: dest.line1,
        line2: dest.line2,
        deliveryNotes: dest.deliveryNotes,
        postalCode: dest.postalCode,
        city: dest.city,
        countryCode: dest.countryCode,
        phone: dest.phone,
        networkCodes: dest.networkCodes.length > 0 ? dest.networkCodes : ['home'],
        pickupPoints: dest.pickupPoints as Address['pickupPoints'],
        isDefault: false,
        savedForFuture: false,
      },
      ...saved,
    ];
  }, [addresses, addressId, giftSummary, isGiftCart]);
  const facturationAddresses = useMemo(() => addresses.filter((a) => a.kind === 'facturation'), [addresses]);
  const [courierList, setCourierList] = useState<Courier[]>([]);
  const [disabledCourierCodes, setDisabledCourierCodes] = useState<string[]>([]);
  const [courierOverflowOpen, setCourierOverflowOpen] = useState(false);
  const [promotedCourierCodes, setPromotedCourierCodes] = useState<ReadonlySet<string>>(() => new Set());
  const [courierCode, setCourierCode] = useState<string | null>(null);
  /** Account default delivery mode (GET /account/couriers/default) shown as
   * the same "Par défaut" badge addresses already use. Null for guests. */
  const [defaultCourierCode, setDefaultCourierCode] = useState<string | null>(null);
  const [express, setExpress] = useState(false);
  // Gates persist-on-change until the current bootstrap generation has been
  // applied into local delivery/payment state (mirrors former selectionRestored).
  const [selectionApplied, setSelectionApplied] = useState(false);
  const selectionAppliedRef = useRef(false);
  const appliedGenerationRef = useRef<string | null>(null);
  const appliedRevisionRef = useRef<number | null>(null);
  const [addressNotice, setAddressNotice] = useState(false);

  // Guest→auth / cart identity change: blank shell until the new generation
  // applies. Cart switch keeps previous snapshot via boot.status === 'switching'.
  useEffect(() => {
    if (
      boot.status === 'auth_loading' ||
      boot.status === 'cart_loading' ||
      boot.status === 'bootstrapping' ||
      boot.status === 'empty'
    ) {
      appliedGenerationRef.current = null;
      appliedRevisionRef.current = null;
      selectionAppliedRef.current = false;
      setSelectionApplied(false);
    }
  }, [boot.status]);

  // Apply the ready snapshot into local editable delivery/payment state.
  // Generation change = full restore; same generation + new revision = soft
  // merge lists and drop selection only when an id is no longer valid.
  useEffect(() => {
    const snapshot = boot.data;
    if (!snapshot) return;

    const generationChanged = appliedGenerationRef.current !== snapshot.generation;
    if (!generationChanged && appliedRevisionRef.current === snapshot.revision) return;

    const { delivery } = snapshot;
    appliedGenerationRef.current = snapshot.generation;
    appliedRevisionRef.current = snapshot.revision;

    if (generationChanged) {
      setAddresses(delivery.addresses);
      setCountries(delivery.countries);
      setCourierList(delivery.couriers);
      setDisabledCourierCodes(delivery.disabledCourierCodes);
      setDefaultCourierCode(delivery.defaultCourierCode);
      setAddressId(delivery.selection.addressId);
      setBillingAddressId(delivery.selection.billingAddressId);
      setSameAsBilling(delivery.selection.sameAsBilling);
      setCourierCode(delivery.selection.courierCode);
      setExpress(delivery.selection.express);
      setPaymentMethodId(delivery.selection.paymentMethodId);
      setPromoCode(delivery.selection.voucherCode ?? '');
      setApplyLoyalty(delivery.selection.applyLoyalty ?? false);
      selectionAppliedRef.current = true;
      setSelectionApplied(true);
      return;
    }

    // Soft revalidate: refresh catalogues; keep the customer's current picks
    // when they still exist in the new lists.
    setAddresses(delivery.addresses);
    setCountries(delivery.countries);
    setCourierList(delivery.couriers);
    setDisabledCourierCodes(delivery.disabledCourierCodes);
    setDefaultCourierCode(delivery.defaultCourierCode);
    setAddressId((current) => {
      if (current && delivery.addresses.some((a) => a.id === current && a.kind === 'livraison')) {
        return current;
      }
      return delivery.selection.addressId;
    });
    setBillingAddressId((current) => {
      if (current && delivery.addresses.some((a) => a.id === current && a.kind === 'facturation')) {
        return current;
      }
      return delivery.selection.billingAddressId;
    });
    setCourierCode((current) => {
      if (current && delivery.couriers.some((c) => c.code === current)) return current;
      return delivery.selection.courierCode;
    });
    setPaymentMethodId((current) => {
      if (!current) return delivery.selection.paymentMethodId;
      const shop = snapshot.payment.shopPaymentMethods;
      const countries = snapshot.payment.paymentMethodCountries ?? EMPTY_PAYMENT_METHOD_COUNTRIES;
      const effective = snapshot.payment.countryContext?.effectiveCountries ?? [];
      if (
        isSelectedPaymentMethodStillValid(
          current,
          shop,
          snapshot.payment,
          snapshot.walletAvailability,
          countries,
          effective,
        )
      ) {
        return current;
      }
      return delivery.selection.paymentMethodId;
    });
  }, [boot.data, setPaymentMethodId, setPromoCode, setApplyLoyalty]);

  // Persists the delivery selection after every change, not just at Payer
  // time. This is what actually lets a full remount (Mondial Relay picker
  // page, a failed PayPal redirect, a different device) restore it via the
  // bootstrap loaders. selectionApplied guards the very first run so this
  // can never fire with the pre-apply null/false initial state and overwrite
  // what was just fetched. Fire-and-forget: this is advisory UX convenience,
  // not something a transient failure should surface as an error to the customer.
  //
  // persistAbortRef cancels the previous in-flight PUT before sending a new
  // one. Without it, two rapid changes (the courier auto-select effect
  // immediately followed by a customer's own click) can have their
  // responses arrive out of order, letting the earlier, now-stale value
  // win on the server since a plain PUT has no other ordering signal.
  const persistAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!selectionAppliedRef.current || !selectionApplied) return;
    if (status === 'anonymous') {
      // A cart-only guest has no encrypted address state to persist. Avoid
      // generating a vault key and queueing an empty advisory write: login
      // deliberately waits for real address/card writes before reconciling
      // baskets, so a no-op here must not sit in that critical path.
      if (addresses.length > 0 || addressId !== null || billingAddressId !== null || !sameAsBilling) {
        void saveGuestAddressState({
          selectedAddressId: addressId,
          sameAsBilling,
          selectedBillingAddressId: billingAddressId,
        });
      }
      saveGuestState({
        courierCode,
        express,
        paymentMethodId:
          paymentMethodId && isCheckoutPaymentPreferenceSentinel(paymentMethodId) ? paymentMethodId : null,
      });
      return;
    }
    if (status !== 'authenticated') return;
    if (isGiftCart && !addressId) return;
    persistAbortRef.current?.abort();
    const controller = new AbortController();
    persistAbortRef.current = controller;
    void authedRequest((token) =>
      authApi.setCheckoutSelection(
        token,
        {
          addressId,
          courierCode,
          express,
          sameAsBilling,
          billingAddressId,
          paymentMethodId,
          voucherCode: appliedVoucherCode ?? (promoCode.trim() || null),
          ...(status === 'authenticated' ? { applyLoyalty } : {}),
        },
        controller.signal,
      ),
    ).catch(() => {});
  }, [
    status,
    selectionApplied,
    addressId,
    isGiftCart,
    courierCode,
    express,
    sameAsBilling,
    billingAddressId,
    addresses.length,
    paymentMethodId,
    appliedVoucherCode,
    promoCode,
    applyLoyalty,
    authedRequest,
  ]);

  function selectAddress(id: string) {
    setAddressId(id);
    setAddressNotice(false);
    if (status === 'anonymous') void saveGuestAddressState({ selectedAddressId: id });
  }

  /** Same home / Mondial Relay switch as the addresses page. Used when
   * adding a delivery address before any shipping method is checked. */
  function openPickupPointPickerFromCart() {
    setAddAddressOpen(false);
    setPickupAddressInitial(undefined);
    navigate(localizedPath('/account/addresses/mondial-relay', lang), {
      state: { returnTo: localizedPath('/cart', lang) },
    });
  }

  /** When a delivery method is already selected, skip the home/pickup
   * choice and open the matching form. With none selected, the form
   * offers both (same as /account/addresses) and saving checks the
   * corresponding shipping method. */
  function openAddAddress() {
    const courier = courierList.find((item) => item.code === courierCode);
    if (courier?.code === shopConfig.mondialRelayPickerCourierCode) {
      navigate(localizedPath('/account/addresses/mondial-relay', lang), {
        state: { returnTo: localizedPath('/cart', lang) },
      });
      return;
    }

    if (!courier) {
      setPickupAddressInitial({ networkCodes: ['home'] });
      setAddAddressOpen(true);
      return;
    }

    // A regular address is a home address whenever that is a valid option for
    // the selected courier. Providers without a home network receive all the
    // networks that the selected delivery method accepts.
    const networkCodes = courier.networks.includes('home')
      ? ['home']
      : courier.networks.length
        ? courier.networks
        : ['home'];
    setPickupAddressInitial({ networkCodes });
    setAddAddressOpen(true);
  }

  /** Opened from "Ajouter une autre adresse" without leaving the cart.
   * On save, the new address becomes the selected one immediately (no
   * extra step to come back and pick it); on cancel, nothing changes. */
  async function handleAddAddress(input: AddressInput) {
    if (status === 'anonymous') {
      const newAddress = normalizeGuestAddress(input, crypto.randomUUID());
      const next = [...addresses, newAddress];
      void saveGuestAddressState({ addresses: next, selectedAddressId: newAddress.id });
      // Mirror cards: one-time guest addresses also live in the encrypted
      // checkout vault so a remount still has them if the guest vault key is
      // unavailable, and so guest→auth merge can replace them with the server copy.
      if (newAddress.savedForFuture === false) addEphemeralAddress(newAddress);
      setAddresses(next);
      selectAddress(newAddress.id);
      selectCourierMatchingAddress(newAddress);
      setAddAddressOpen(false);
      setPickupAddressInitial(undefined);
      return;
    }
    const { address } = await authedRequest((token) => accountApi.createAddress(token, input));
    if (address.savedForFuture === false) addEphemeralAddress(address);
    const result = await authedRequest((token) => accountApi.listAddresses(token));
    setAddresses(mergeAddressLists(result.addresses));
    selectAddress(address.id);
    selectCourierMatchingAddress(address);
    setAddAddressOpen(false);
    setPickupAddressInitial(undefined);
  }

  function selectBillingAddress(id: string) {
    setBillingAddressId(id);
    if (status === 'anonymous') void saveGuestAddressState({ selectedBillingAddressId: id });
  }

  function openAddBillingAddress() {
    setAddBillingAddressOpen(true);
  }

  /** Mirrors handleAddAddress above, for the "Adresse de facturation" block.
   * A facturation address has no network/pickup step at all. */
  async function handleAddBillingAddress(input: AddressInput) {
    if (status === 'anonymous') {
      const newAddress = normalizeGuestAddress(input, crypto.randomUUID());
      const next = [...addresses, newAddress];
      void saveGuestAddressState({
        addresses: next,
        sameAsBilling,
        selectedBillingAddressId: newAddress.id,
      });
      if (newAddress.savedForFuture === false) addEphemeralAddress(newAddress);
      setAddresses(next);
      selectBillingAddress(newAddress.id);
      setAddBillingAddressOpen(false);
      return;
    }
    const { address } = await authedRequest((token) => accountApi.createAddress(token, input));
    if (address.savedForFuture === false) addEphemeralAddress(address);
    const result = await authedRequest((token) => accountApi.listAddresses(token));
    setAddresses(mergeAddressLists(result.addresses));
    selectBillingAddress(address.id);
    setAddBillingAddressOpen(false);
  }

  async function handleEditBillingAddress(input: AddressInput) {
    if (!editingBillingAddress) return;
    if (status === 'anonymous') {
      const next = addresses.map((a) =>
        a.id === editingBillingAddress.id ? normalizeGuestAddress(input, editingBillingAddress.id) : a,
      );
      void saveGuestAddressState({ addresses: next });
      setAddresses(next);
      setEditingBillingAddress(null);
      return;
    }
    const { address } = await authedRequest((token) =>
      accountApi.updateAddress(token, editingBillingAddress.id, input),
    );
    if (address.savedForFuture === false) addEphemeralAddress(address);
    else removeEphemeralAddress(address.id);
    const result = await authedRequest((token) => accountApi.listAddresses(token));
    setAddresses(mergeAddressLists(result.addresses));
    setEditingBillingAddress(null);
  }

  function selectMondialRelayPoint(point: PickupPoint) {
    setPickupAddressInitial({
      // See AccountAddressesPage: the relay's own name rides along with the
      // pickup reference and shows as the address's first line, leaving
      // `label` free for whatever the customer wants to call this address.
      line1: point.line1,
      line2: point.line2 || null,
      postalCode: point.postalCode,
      city: point.city,
      countryCode: point.countryCode,
      networkCodes: [shopConfig.mondialRelayPickerNetworkCode],
      pickupPoints: {
        [shopConfig.mondialRelayPickerNetworkCode]: { id: point.id, name: point.name },
      },
    });
    setAddAddressOpen(true);
  }

  useEffect(() => {
    const point = (location.state as { mondialRelayPoint?: PickupPoint } | null)?.mondialRelayPoint;
    if (!point) return;
    selectMondialRelayPoint(point);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  /** Same in-place edit/delete affordance as the address management page,
   * surfaced directly on the cart's own address list (icon buttons) so
   * fixing a typo or removing a stale address doesn't require leaving
   * checkout either. */
  async function handleEditAddress(input: AddressInput) {
    if (!editingAddress) return;
    if (status === 'anonymous') {
      const next = addresses.map((a) =>
        a.id === editingAddress.id ? normalizeGuestAddress(input, editingAddress.id) : a,
      );
      void saveGuestAddressState({ addresses: next });
      setAddresses(next);
      recheckSelectedAddressCompatibility(next, addressId);
      setEditingAddress(null);
      return;
    }
    const { address } = await authedRequest((token) =>
      accountApi.updateAddress(token, editingAddress.id, input),
    );
    if (address.savedForFuture === false) addEphemeralAddress(address);
    else removeEphemeralAddress(address.id);
    const result = await authedRequest((token) => accountApi.listAddresses(token));
    const next = mergeAddressLists(result.addresses);
    setAddresses(next);
    recheckSelectedAddressCompatibility(next, addressId);
    setEditingAddress(null);
  }

  function handleDeleteAddress(id: string) {
    setPendingDeleteAddressId(id);
  }

  async function confirmDeleteAddress() {
    if (!pendingDeleteAddressId) return;
    const id = pendingDeleteAddressId;
    setPendingDeleteAddressId(null);
    if (status === 'anonymous') {
      markCheckoutEntityDeleted(id);
      const next = addresses.filter((a) => a.id !== id);
      void saveGuestAddressState({ addresses: next });
      setAddresses(next);
      if (addressId === id) {
        const nextId = next.find((a) => a.kind === 'livraison')?.id ?? null;
        setAddressId(nextId);
        setAddressNotice(false);
        recheckSelectedAddressCompatibility(next, nextId);
      }
      if (billingAddressId === id) setBillingAddressId(null);
      return;
    }
    await authedRequest((token) => accountApi.deleteAddress(token, id));
    markCheckoutEntityDeleted(id);
    removeEphemeralAddress(id);
    const result = await authedRequest((token) => accountApi.listAddresses(token));
    const next = mergeAddressLists(result.addresses);
    setAddresses(next);
    if (addressId === id) {
      const nextId = next.find((a) => a.isDefault && a.kind === 'livraison')?.id ?? null;
      setAddressId(nextId);
      setAddressNotice(false);
      recheckSelectedAddressCompatibility(next, nextId);
    }
    if (billingAddressId === id) setBillingAddressId(null);
  }

  function selectCourier(code: string) {
    setCourierCode(code);
    setExpress(false);
    if (status === 'anonymous') saveGuestState({ courierCode: code, express: false });
  }

  const promoteCourierCode = useCallback((code: string) => {
    setPromotedCourierCodes((current) => {
      if (current.has(code)) return current;
      const next = new Set(current);
      next.add(code);
      return next;
    });
  }, []);

  /** After adding an address with no shipping method checked, tick the
   * first courier that can actually serve it (country + network, and a
   * packet that fits the cart). A method already chosen is left alone. */
  function selectCourierMatchingAddress(address: Address) {
    if (courierCode) return;
    const effective = buildEffectiveCountries(
      address.countryCode,
      boot.data?.payment.countryContext.geoCountry,
    );
    const disabled = new Set(disabledCourierCodes);
    const match = courierList.find(
      (item) =>
        courierOverflowTier(disabled.has(item.code), item.countries, effective) === 'primary' &&
        courierCompatible(item, address) &&
        !!pickCourierTier(item, totalQuantity),
    );
    if (match) selectCourier(match.code);
  }

  // A delivery method remains selected even if the current address no longer
  // fits it. The address is cleared instead, because address availability is
  // determined by the chosen delivery method, not the other way around.
  const recheckSelectedAddressCompatibility = useCallback(
    (currentAddresses: Address[], currentAddressId: string | null) => {
      if (!courierCode) return;
      const address = currentAddresses.find((a) => a.id === currentAddressId);
      const courier = courierList.find((c) => c.code === courierCode);
      if (!address || !courier) return;
      const { countryOk, networkOk } = courierMatch(courier, address);
      if (!countryOk || !networkOk) {
        setAddressId(null);
        setAddressNotice(true);
      }
    },
    [courierCode, courierList],
  );

  // Recheck when a delivery method or the address data changes. A selected
  // address that is no longer supported is cleared; incompatible addresses
  // remain listed but are disabled for the selected method.
  useEffect(() => {
    recheckSelectedAddressCompatibility(livraisonAddresses, addressId);
  }, [addressId, livraisonAddresses, recheckSelectedAddressCompatibility]);

  const selectedCourier = courierList.find((c) => c.code === courierCode);
  // Delivery estimates are quoted per destination country, so they can only
  // be shown after both an address and a delivery method are selected.
  const shippingCountryCode = livraisonAddresses.find((a) => a.id === addressId)?.countryCode;
  const checkoutEffectiveCountries = liveEffectiveCountries(
    shippingCountryCode,
    boot.data?.payment.countryContext.geoCountry,
    boot.data?.payment.countryContext.effectiveCountries ?? [],
  );
  const courierOverflowOptions = useMemo(
    () =>
      buildCourierOverflowOptions(
        courierList,
        disabledCourierCodes,
        checkoutEffectiveCountries,
        promotedCourierCodes,
      ),
    [courierList, disabledCourierCodes, checkoutEffectiveCountries, promotedCourierCodes],
  );

  useEffect(() => {
    if (!courierCode) return;
    const courier = courierList.find((item) => item.code === courierCode);
    if (!courier) return;
    if (
      courierOverflowTier(
        disabledCourierCodes.includes(courier.code),
        courier.countries,
        checkoutEffectiveCountries,
      ) === 'overflow'
    ) {
      promoteCourierCode(courier.code);
    }
  }, [courierCode, courierList, disabledCourierCodes, checkoutEffectiveCountries, promoteCourierCode]);

  function handleOverflowCourierPick(code: string) {
    setCourierOverflowOpen(false);
    promoteCourierCode(code);
    selectCourier(code);
  }

  function resetDeliveryAfterGuestOrder() {
    setAddresses([]);
    setAddressId(null);
    setBillingAddressId(null);
    setSameAsBilling(true);
    setCourierCode(null);
    setExpress(false);
    setPromotedCourierCodes(new Set());
  }

  function pruneOneTimeAddressesAfterOrder() {
    const oneTimeAddressIds = new Set(
      addresses.filter((address) => address.savedForFuture === false).map((address) => address.id),
    );
    setAddresses((current) => current.filter((address) => address.savedForFuture !== false));
    setAddressId((current) => (current && oneTimeAddressIds.has(current) ? null : current));
    setBillingAddressId((current) => (current && oneTimeAddressIds.has(current) ? null : current));
    setPromotedCourierCodes(new Set());
  }

  return {
    addresses,
    setAddresses,
    addressId,
    setAddressId,
    countries,
    addAddressOpen,
    setAddAddressOpen,
    pickupAddressInitial,
    setPickupAddressInitial,
    editingAddress,
    setEditingAddress,
    pendingDeleteAddressId,
    setPendingDeleteAddressId,
    sameAsBilling,
    setSameAsBilling,
    billingAddressId,
    setBillingAddressId,
    addBillingAddressOpen,
    setAddBillingAddressOpen,
    editingBillingAddress,
    setEditingBillingAddress,
    livraisonAddresses,
    facturationAddresses,
    courierList,
    disabledCourierCodes,
    courierOverflowOpen,
    setCourierOverflowOpen,
    promotedCourierCodes,
    courierCode,
    setCourierCode,
    defaultCourierCode,
    express,
    setExpress,
    addressNotice,
    selectedCourier,
    shippingCountryCode,
    checkoutEffectiveCountries,
    courierOverflowOptions,
    selectAddress,
    openPickupPointPickerFromCart,
    openAddAddress,
    handleAddAddress,
    selectBillingAddress,
    openAddBillingAddress,
    handleAddBillingAddress,
    handleEditBillingAddress,
    handleEditAddress,
    handleDeleteAddress,
    confirmDeleteAddress,
    selectCourier,
    handleOverflowCourierPick,
    resetDeliveryAfterGuestOrder,
    pruneOneTimeAddressesAfterOrder,
  };
}
