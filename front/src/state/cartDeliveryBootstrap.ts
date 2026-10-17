import * as authApi from '../api/account';
import { type Address, type Country, type Courier } from '../api/account';
import { getCheckoutSelection } from '../api/checkout';
import { ApiError } from '../api/errors';
import { courierCompatible } from '../utils/courierMatch';
import { courierOverflowTier } from '../utils/checkoutOverflow';
import {
  addEphemeralAddress,
  loadEphemeralAddresses,
  mergeAddressLists,
  removeEphemeralAddress,
} from './ephemeralAddresses';
import { loadGuestAddressState } from './guestCardVault';
import { loadGuestState } from './guestCart';
import { takePendingVoucherCode } from './guestSync';

export type CheckoutSelectionSnapshot = {
  addressId: string | null;
  billingAddressId: string | null;
  sameAsBilling: boolean;
  courierCode: string | null;
  express: boolean;
  paymentMethodId: string | null;
  voucherCode: string | null;
  applyLoyalty?: boolean;
};

export type DeliveryBootstrap = {
  addresses: Address[];
  countries: Country[];
  couriers: Courier[];
  disabledCourierCodes: string[];
  defaultCourierCode: string | null;
  selection: CheckoutSelectionSnapshot;
};

/** Checked by default (billing = delivery), unless the customer already has
 * a default facturation address saved. */
function defaultBillingSelection(addressList: Address[]): {
  sameAsBilling: boolean;
  billingAddressId: string | null;
} {
  const defaultFacturation = addressList.find((a) => a.kind === 'facturation' && a.isDefault);
  return defaultFacturation
    ? { sameAsBilling: false, billingAddressId: defaultFacturation.id }
    : { sameAsBilling: true, billingAddressId: null };
}

export async function loadGuestDeliveryBootstrap(): Promise<DeliveryBootstrap> {
  const [couriersResult, countriesResult, guestAddressState] = await Promise.all([
    authApi.listCouriers(),
    authApi.listCountries(),
    loadGuestAddressState(),
  ]);
  const guestState = loadGuestState();
  const guestAddresses = mergeAddressLists(guestAddressState.addresses);

  const restoredAddressStillExists =
    !!guestAddressState.selectedAddressId &&
    guestAddresses.some((a) => a.id === guestAddressState.selectedAddressId && a.kind === 'livraison');
  const addressId = restoredAddressStillExists
    ? guestAddressState.selectedAddressId
    : (guestAddresses.find((a) => a.kind === 'livraison')?.id ?? null);

  const restoredBillingStillExists =
    !!guestAddressState.selectedBillingAddressId &&
    guestAddresses.some(
      (a) => a.id === guestAddressState.selectedBillingAddressId && a.kind === 'facturation',
    );
  let sameAsBilling: boolean;
  let billingAddressId: string | null;
  if (restoredBillingStillExists) {
    sameAsBilling = guestAddressState.sameAsBilling;
    billingAddressId = guestAddressState.selectedBillingAddressId;
  } else {
    const fallback = defaultBillingSelection(guestAddresses);
    sameAsBilling = fallback.sameAsBilling;
    billingAddressId = fallback.billingAddressId;
  }

  const sortedCouriers = [...couriersResult.couriers].sort((a, b) => a.sortOrder - b.sortOrder);
  const courierCode =
    guestState.courierCode && sortedCouriers.some((c) => c.code === guestState.courierCode)
      ? guestState.courierCode
      : null;

  return {
    addresses: guestAddresses,
    countries: countriesResult.countries,
    couriers: sortedCouriers,
    disabledCourierCodes: [],
    defaultCourierCode: null,
    selection: {
      addressId,
      billingAddressId,
      sameAsBilling,
      courierCode,
      express: courierCode ? guestState.express : false,
      // Restored from payment bootstrap (guest vault default), not forced null.
      paymentMethodId: null,
      voucherCode: guestState.voucherCode,
    },
  };
}

type AuthedRequest = <T>(fn: (token: string) => Promise<T>) => Promise<T>;

export async function loadAuthDeliveryBootstrap(authedRequest: AuthedRequest): Promise<DeliveryBootstrap> {
  const [
    addressesResult,
    couriersResult,
    countriesResult,
    selectionResult,
    defaultCourierResult,
    disabledCouriersResult,
  ] = await Promise.all([
    authedRequest((token) => authApi.listAddresses(token)),
    authApi.listCouriers(),
    authApi.listCountries(),
    authedRequest((token) => getCheckoutSelection(token)),
    authedRequest((token) => authApi.getDefaultCourier(token)),
    authedRequest((token) => authApi.listDisabledCouriers(token)),
  ]);

  const ephemeralCandidates = loadEphemeralAddresses().filter((address) => address.savedForFuture === false);
  if (ephemeralCandidates.length > 0) {
    const verifiedEphemeral = await Promise.all(
      ephemeralCandidates.map(async (address) => {
        try {
          return (await authedRequest((token) => authApi.getAddress(token, address.id))).address;
        } catch (error) {
          if (error instanceof ApiError && error.code === 'not_found') removeEphemeralAddress(address.id);
          return null;
        }
      }),
    );
    for (const address of verifiedEphemeral) {
      if (address?.savedForFuture === false) addEphemeralAddress(address);
    }
  }

  let availableAddresses = mergeAddressLists(addressesResult.addresses);
  const missingSelectionIds = [selectionResult.addressId, selectionResult.billingAddressId].filter(
    (id): id is string => !!id && !availableAddresses.some((a) => a.id === id),
  );
  if (missingSelectionIds.length > 0) {
    const hydrated = await Promise.all(
      missingSelectionIds.map((id) =>
        authedRequest((token) => authApi.getAddress(token, id))
          .then((result) => result.address)
          .catch(() => null),
      ),
    );
    for (const address of hydrated) {
      if (!address) continue;
      if (address.savedForFuture === false) addEphemeralAddress(address);
    }
    availableAddresses = mergeAddressLists(addressesResult.addresses);
  }

  const restoredAddressId = selectionResult.addressId;
  const restoredAddressStillExists =
    !!restoredAddressId && availableAddresses.some((a) => a.id === restoredAddressId);
  const addressId = restoredAddressStillExists
    ? restoredAddressId
    : (availableAddresses.find((a) => a.isDefault && a.kind === 'livraison')?.id ?? null);

  const restoredBillingId = selectionResult.billingAddressId;
  const restoredBillingStillExists =
    !!restoredBillingId &&
    availableAddresses.some((a) => a.id === restoredBillingId && a.kind === 'facturation');
  let sameAsBilling: boolean;
  let billingAddressId: string | null;
  if (restoredBillingStillExists) {
    sameAsBilling = selectionResult.sameAsBilling;
    billingAddressId = restoredBillingId;
  } else {
    const fallback = defaultBillingSelection(availableAddresses);
    sameAsBilling = fallback.sameAsBilling;
    billingAddressId = fallback.billingAddressId;
  }

  const disabledCourierCodes = disabledCouriersResult.courierCodes;
  const disabledSet = new Set(disabledCourierCodes);
  const sortedCouriers = [...couriersResult.couriers].sort((a, b) => a.sortOrder - b.sortOrder);

  const restoredCourierCode = selectionResult.courierCode;
  const initialAddress = availableAddresses.find((a) => a.id === addressId);
  const bootstrapEffectiveCountries = initialAddress?.countryCode ? [initialAddress.countryCode] : [];
  const courierTier = (courier: Courier) =>
    courierOverflowTier(disabledSet.has(courier.code), courier.countries, bootstrapEffectiveCountries);
  const restoredCourier = sortedCouriers.find((c) => c.code === restoredCourierCode);
  const defaultCourier = sortedCouriers.find((c) => c.code === defaultCourierResult.courierCode);
  const restoredCourierConflictsWithAddress =
    !!restoredCourier && !!initialAddress && !courierCompatible(restoredCourier, initialAddress);

  let courierCode: string | null = null;
  let express = false;
  if (restoredCourier && !(defaultCourier && restoredCourierConflictsWithAddress)) {
    courierCode = restoredCourierCode;
    express = selectionResult.express;
  } else if (defaultCourier && courierTier(defaultCourier) === 'primary') {
    courierCode = defaultCourier.code;
    express = false;
  } else {
    const primaryMatch = sortedCouriers.find(
      (c) => courierTier(c) === 'primary' && (!initialAddress || courierCompatible(c, initialAddress)),
    );
    if (primaryMatch) {
      courierCode = primaryMatch.code;
      express = false;
    }
  }

  const pendingVoucherCode = takePendingVoucherCode();
  const voucherCode = pendingVoucherCode || selectionResult.voucherCode || null;

  return {
    addresses: availableAddresses,
    countries: countriesResult.countries,
    couriers: sortedCouriers,
    disabledCourierCodes,
    defaultCourierCode: defaultCourierResult.courierCode,
    selection: {
      addressId,
      billingAddressId,
      sameAsBilling,
      courierCode,
      express,
      paymentMethodId: selectionResult.paymentMethodId,
      voucherCode,
      applyLoyalty: selectionResult.applyLoyalty ?? false,
    },
  };
}
