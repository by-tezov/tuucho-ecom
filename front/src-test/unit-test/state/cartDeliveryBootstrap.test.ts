import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address, Courier } from '../../../src/api/account';
import type { GuestAddressState } from '../../../src/state/guestCardVault';
import type { CheckoutSelectionSnapshot } from '../../../src/state/cartDeliveryBootstrap';

const api = vi.hoisted(() => ({
  listAddresses: vi.fn(),
  listCouriers: vi.fn(),
  listCountries: vi.fn(),
  getDefaultCourier: vi.fn(),
  listDisabledCouriers: vi.fn(),
  getAddress: vi.fn(),
  getCheckoutSelection: vi.fn(),
  loadGuestAddressState: vi.fn(),
}));

vi.mock('../../../src/api/account', () => ({
  listAddresses: api.listAddresses,
  listCouriers: api.listCouriers,
  listCountries: api.listCountries,
  getDefaultCourier: api.getDefaultCourier,
  listDisabledCouriers: api.listDisabledCouriers,
  getAddress: api.getAddress,
}));
vi.mock('../../../src/api/checkout', () => ({ getCheckoutSelection: api.getCheckoutSelection }));
vi.mock('../../../src/state/guestCardVault', () => ({ loadGuestAddressState: api.loadGuestAddressState }));

import {
  loadAuthDeliveryBootstrap,
  loadGuestDeliveryBootstrap,
} from '../../../src/state/cartDeliveryBootstrap';
import { saveGuestState } from '../../../src/state/guestCart';

function address(id: string, overrides: Partial<Address> = {}): Address {
  return {
    id,
    kind: 'livraison',
    label: null,
    recipientName: null,
    companyName: null,
    line1: '1 rue',
    line2: null,
    deliveryNotes: null,
    postalCode: '75001',
    city: 'Paris',
    countryCode: 'FR',
    phone: null,
    networkCodes: ['home'],
    pickupPoints: {},
    isDefault: false,
    savedForFuture: true,
    ...overrides,
  };
}

function courier(code: string, sortOrder: number, overrides: Partial<Courier> = {}): Courier {
  return { code, name: code, sortOrder, countries: ['FR'], networks: ['home'], packets: [], ...overrides };
}

function selection(overrides: Partial<CheckoutSelectionSnapshot> = {}): CheckoutSelectionSnapshot {
  return {
    addressId: null,
    billingAddressId: null,
    sameAsBilling: true,
    courierCode: null,
    express: false,
    paymentMethodId: null,
    voucherCode: null,
    ...overrides,
  };
}

const authedRequest = <T>(fn: (token: string) => Promise<T>) => fn('token');

function givenAccount(options: {
  addresses: Address[];
  couriers: Courier[];
  selection?: Partial<CheckoutSelectionSnapshot>;
  defaultCourier?: string | null;
  disabled?: string[];
}) {
  api.listAddresses.mockResolvedValue({ addresses: options.addresses });
  api.listCouriers.mockResolvedValue({ couriers: options.couriers });
  api.listCountries.mockResolvedValue({ countries: [] });
  api.getCheckoutSelection.mockResolvedValue(selection(options.selection));
  api.getDefaultCourier.mockResolvedValue({ courierCode: options.defaultCourier ?? null });
  api.listDisabledCouriers.mockResolvedValue({ courierCodes: options.disabled ?? [] });
}

beforeEach(() => {
  api.getAddress.mockRejectedValue(new Error('unexpected getAddress'));
});

afterEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('loadAuthDeliveryBootstrap', () => {
  it('restores the saved selection when it still exists', async () => {
    givenAccount({
      addresses: [
        address('home', { isDefault: true }),
        address('work'),
        address('bill', { kind: 'facturation' }),
      ],
      couriers: [courier('b', 2), courier('a', 1)],
      selection: {
        addressId: 'work',
        billingAddressId: 'bill',
        sameAsBilling: false,
        courierCode: 'b',
        express: true,
      },
    });
    const result = await loadAuthDeliveryBootstrap(authedRequest);
    expect(result.couriers.map((c) => c.code)).toEqual(['a', 'b']);
    expect(result.selection).toMatchObject({
      addressId: 'work',
      billingAddressId: 'bill',
      sameAsBilling: false,
      courierCode: 'b',
      express: true,
    });
  });

  it('falls back to the default delivery and billing addresses when the saved ones are gone', async () => {
    givenAccount({
      addresses: [
        address('home', { isDefault: true }),
        address('bill', { kind: 'facturation', isDefault: true }),
      ],
      couriers: [courier('a', 1)],
      selection: { addressId: 'deleted', billingAddressId: 'deleted-bill', sameAsBilling: false },
    });
    api.getAddress.mockRejectedValue(new Error('not found'));
    const result = await loadAuthDeliveryBootstrap(authedRequest);
    expect(result.selection).toMatchObject({
      addressId: 'home',
      billingAddressId: 'bill',
      sameAsBilling: false,
    });
  });

  it('prefers the account default courier over a restored courier that cannot serve the address', async () => {
    givenAccount({
      addresses: [address('home', { isDefault: true })],
      couriers: [courier('relay', 1, { networks: ['relay'] }), courier('home-courier', 2)],
      selection: { addressId: 'home', courierCode: 'relay', express: true },
      defaultCourier: 'home-courier',
    });
    const result = await loadAuthDeliveryBootstrap(authedRequest);
    expect(result.selection).toMatchObject({ courierCode: 'home-courier', express: false });
  });

  it('picks the first compatible courier when nothing is restored, skipping hidden and foreign ones', async () => {
    givenAccount({
      addresses: [address('home', { isDefault: true })],
      couriers: [
        courier('hidden', 1),
        courier('belgium-only', 2, { countries: ['BE'] }),
        courier('relay', 3, { networks: ['relay'] }),
        courier('ok', 4),
      ],
      disabled: ['hidden'],
    });
    const result = await loadAuthDeliveryBootstrap(authedRequest);
    expect(result.selection.courierCode).toBe('ok');
    expect(result.disabledCourierCodes).toEqual(['hidden']);
  });

  it('does not auto-select a courier the customer hid, even as account default', async () => {
    givenAccount({
      addresses: [address('home', { isDefault: true })],
      couriers: [courier('hidden', 1)],
      defaultCourier: 'hidden',
      disabled: ['hidden'],
    });
    const result = await loadAuthDeliveryBootstrap(authedRequest);
    expect(result.selection.courierCode).toBeNull();
  });

  it('lets a voucher typed before login win over the stored one, once', async () => {
    givenAccount({ addresses: [], couriers: [], selection: { voucherCode: 'OLD' } });
    window.sessionStorage.setItem('psn-pending-voucher', 'GUEST10');
    expect((await loadAuthDeliveryBootstrap(authedRequest)).selection.voucherCode).toBe('GUEST10');
    expect((await loadAuthDeliveryBootstrap(authedRequest)).selection.voucherCode).toBe('OLD');
  });
});

describe('loadGuestDeliveryBootstrap', () => {
  function givenGuest(state: Partial<GuestAddressState>, couriers: Courier[] = [courier('a', 1)]) {
    api.listCouriers.mockResolvedValue({ couriers });
    api.listCountries.mockResolvedValue({ countries: [] });
    api.loadGuestAddressState.mockResolvedValue({
      addresses: [],
      selectedAddressId: null,
      selectedBillingAddressId: null,
      sameAsBilling: true,
      ...state,
    });
  }

  it('restores the guest picks and drops a courier the shop no longer offers', async () => {
    givenGuest({
      addresses: [address('g1'), address('g2'), address('gb', { kind: 'facturation' })],
      selectedAddressId: 'g2',
      selectedBillingAddressId: 'gb',
      sameAsBilling: false,
    });
    saveGuestState({ courierCode: 'gone', express: true, voucherCode: 'V1' });
    const result = await loadGuestDeliveryBootstrap();
    expect(result.selection).toMatchObject({
      addressId: 'g2',
      billingAddressId: 'gb',
      sameAsBilling: false,
      courierCode: null,
      express: false,
      voucherCode: 'V1',
    });
  });

  it('falls back to the first delivery address and keeps a valid courier with its express flag', async () => {
    givenGuest({
      addresses: [address('gb', { kind: 'facturation' }), address('g1')],
      selectedAddressId: 'gb',
    });
    saveGuestState({ courierCode: 'a', express: true });
    const result = await loadGuestDeliveryBootstrap();
    expect(result.selection).toMatchObject({
      addressId: 'g1',
      courierCode: 'a',
      express: true,
      sameAsBilling: true,
    });
  });
});
