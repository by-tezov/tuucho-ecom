import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from '@/api/account';
import type { CartSummary } from '@/api/cart';
import type { GuestAddressState, GuestCards } from '@/state/guestCardVault';

/** In-memory stand-in for the encrypted guest checkout vault: these tests are
 * about which guest data reaches the account and what survives a failure,
 * not about the encryption itself (guestCardVault.test.ts covers that). */
const vault = vi.hoisted(() => ({
  cards: { paymentMethods: [], defaultPaymentMethod: null } as GuestCards,
  addresses: {
    addresses: [],
    selectedAddressId: null,
    selectedBillingAddressId: null,
    sameAsBilling: true,
  } as GuestAddressState,
}));

const api = vi.hoisted(() => ({
  upsertFavorite: vi.fn(),
  createAddress: vi.fn(),
  attachPaymentMethod: vi.fn(),
  setDefaultPaymentMethod: vi.fn(),
  setCheckoutSelection: vi.fn(),
  listCarts: vi.fn(),
  importGuestCart: vi.fn(),
  addToCart: vi.fn(),
}));

vi.mock('@/api/favorites', () => ({ upsertFavorite: api.upsertFavorite }));
vi.mock('@/api/account', () => ({ createAddress: api.createAddress }));
vi.mock('@/api/checkout', () => ({
  attachPaymentMethod: api.attachPaymentMethod,
  setDefaultPaymentMethod: api.setDefaultPaymentMethod,
  setCheckoutSelection: api.setCheckoutSelection,
}));
vi.mock('@/api/cart', () => ({
  listCarts: api.listCarts,
  importGuestCart: api.importGuestCart,
  addToCart: api.addToCart,
}));
vi.mock('@/state/galleryNailEditSession', () => ({ parkGuestComposeDraftForSignIn: vi.fn() }));
vi.mock('@/state/guestCardVault', () => ({
  flushGuestCheckoutVault: vi.fn(async () => {}),
  loadGuestCards: vi.fn(async () => structuredClone(vault.cards)),
  loadGuestAddressState: vi.fn(async () => structuredClone(vault.addresses)),
  saveGuestCards: vi.fn(async (patch: Partial<GuestCards>) => {
    vault.cards = { ...vault.cards, ...patch };
    return vault.cards;
  }),
  saveGuestAddressState: vi.fn(async (patch: Partial<GuestAddressState>) => {
    vault.addresses = { ...vault.addresses, ...patch };
    return vault.addresses;
  }),
  clearGuestCards: vi.fn(() => {
    vault.cards = { paymentMethods: [], defaultPaymentMethod: null };
    vault.addresses = {
      addresses: [],
      selectedAddressId: null,
      selectedBillingAddressId: null,
      sameAsBilling: true,
    };
  }),
}));

import { loadGuestState, saveGuestState } from '@/state/guestCart';
import {
  completeGuestCartMerge,
  mergeGuestStateIntoAccount,
  parkGuestCartAsUnconnected,
  takePendingVoucherCode,
} from '@/state/guestSync';
import { UNCONNECTED_CART_SENTINEL } from '@/utils/cartDisplayName';

function guestAddress(id: string, savedForFuture: boolean): Address {
  return {
    id,
    kind: 'livraison',
    label: null,
    recipientName: 'Ada',
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
    isDefault: true,
    savedForFuture,
  };
}

function cart(overrides: Partial<CartSummary>): CartSummary {
  return {
    id: 'cart-1',
    name: 'Panier',
    kind: 'default',
    isActive: true,
    itemCount: 0,
    total: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const line = { productId: 'p1', shapeKey: 'almond', lengthKey: 'short', size: 'M' as const, quantity: 2 };

beforeEach(() => {
  api.createAddress.mockImplementation(async (_token: string, input: { savedForFuture: boolean }) => ({
    address: { ...guestAddress(`account-${input.savedForFuture ? 'saved' : 'once'}`, input.savedForFuture) },
  }));
  api.attachPaymentMethod.mockImplementation(async (_token: string, id: string) => ({
    paymentMethod: { id: `${id}_attached` },
  }));
  api.importGuestCart.mockResolvedValue({});
  api.listCarts.mockResolvedValue({ carts: [], cartLimit: 10 });
});

afterEach(() => {
  vault.cards = { paymentMethods: [], defaultPaymentMethod: null };
  vault.addresses = {
    addresses: [],
    selectedAddressId: null,
    selectedBillingAddressId: null,
    sameAsBilling: true,
  };
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('mergeGuestStateIntoAccount', () => {
  it('does nothing when the guest has no data at all', async () => {
    await expect(mergeGuestStateIntoAccount('token')).resolves.toEqual({ status: 'done' });
    expect(api.listCarts).not.toHaveBeenCalled();
    expect(api.importGuestCart).not.toHaveBeenCalled();
  });

  it('splits stored favorite variants back into shape and length', async () => {
    saveGuestState({ favorites: { p1: 'almond::short', p2: 'coffin' } });
    await mergeGuestStateIntoAccount('token');
    expect(api.upsertFavorite).toHaveBeenCalledWith('token', 'p1', 'almond', 'short');
    expect(api.upsertFavorite).toHaveBeenCalledWith('token', 'p2', 'coffin', '');
  });

  it('on a plain login, never copies remembered addresses or cards onto the existing account', async () => {
    vault.addresses.addresses = [guestAddress('g-saved', true), guestAddress('g-once', false)];
    vault.cards.paymentMethods = [
      { id: 'pm_saved', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030, savedForFuture: true },
      { id: 'pm_once', brand: 'visa', last4: '1111', expMonth: 1, expYear: 2030, savedForFuture: false },
    ] as GuestCards['paymentMethods'];
    vault.cards.defaultPaymentMethod = { type: 'card', id: 'pm_saved' };

    await mergeGuestStateIntoAccount('token');

    expect(api.createAddress).toHaveBeenCalledTimes(1);
    expect(api.createAddress.mock.calls[0]?.[1]).toMatchObject({ savedForFuture: false, isDefault: false });
    expect(api.attachPaymentMethod).toHaveBeenCalledTimes(1);
    expect(api.attachPaymentMethod).toHaveBeenCalledWith('token', 'pm_once', false);
    expect(api.setDefaultPaymentMethod).not.toHaveBeenCalled();
    // Remembered rows were not migrated, so they stay in the vault.
    expect(vault.addresses.addresses.map((a) => a.id)).toEqual(['g-saved']);
    expect(vault.cards.paymentMethods.map((m) => m.id)).toEqual(['pm_saved']);
  });

  it('on register, attaches remembered details and promotes the remapped default card', async () => {
    vault.cards.paymentMethods = [
      { id: 'pm_saved', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030, savedForFuture: true },
    ] as GuestCards['paymentMethods'];
    vault.cards.defaultPaymentMethod = { type: 'card', id: 'pm_saved' };
    saveGuestState({ cart: [line] });

    await mergeGuestStateIntoAccount('token', { attachRememberedCheckout: true });

    expect(api.setDefaultPaymentMethod).toHaveBeenCalledWith('token', {
      type: 'card',
      id: 'pm_saved_attached',
    });
    expect(api.importGuestCart.mock.calls[0]?.[1].selection.paymentMethodId).toBe('pm_saved_attached');
  });

  it('keeps a guest address in the vault when its migration fails', async () => {
    vault.addresses.addresses = [guestAddress('g-once', false)];
    api.createAddress.mockRejectedValue(new Error('500'));
    await mergeGuestStateIntoAccount('token');
    expect(vault.addresses.addresses.map((a) => a.id)).toEqual(['g-once']);
  });

  it('imports into a new cart when the account has none, and clears guest state', async () => {
    saveGuestState({
      cart: [{ ...line, comment: 'gift wrap' }],
      courierCode: 'colissimo',
      voucherCode: 'WELCOME',
    });

    await expect(mergeGuestStateIntoAccount('token')).resolves.toEqual({ status: 'done' });

    const payload = api.importGuestCart.mock.calls[0]?.[1];
    expect(payload.mode).toBe('new');
    expect(payload.items).toEqual([{ ...line, packKey: '', comment: 'gift wrap' }]);
    expect(payload.selection).toMatchObject({ courierCode: 'colissimo', voucherCode: 'WELCOME' });
    expect(loadGuestState().cart).toEqual([]);
    expect(takePendingVoucherCode()).toBe('WELCOME');
    expect(takePendingVoucherCode()).toBeNull();
  });

  it('merges straight into an empty default cart even when other carts exist', async () => {
    saveGuestState({ cart: [line] });
    api.listCarts.mockResolvedValue({
      carts: [
        cart({ id: 'named', kind: 'named' as CartSummary['kind'], itemCount: 3 }),
        cart({ id: 'default' }),
      ],
      cartLimit: 5,
    });
    await expect(mergeGuestStateIntoAccount('token')).resolves.toEqual({ status: 'done' });
    expect(api.importGuestCart.mock.calls[0]?.[1]).toMatchObject({ mode: 'merge', targetCartId: 'default' });
  });

  it('asks the customer when the default cart already holds items, keeping guest state', async () => {
    saveGuestState({ cart: [line] });
    api.listCarts.mockResolvedValue({ carts: [cart({ itemCount: 2 })], cartLimit: 4 });

    const result = await mergeGuestStateIntoAccount('token');

    expect(result.status).toBe('needs_cart_choice');
    if (result.status !== 'needs_cart_choice') return;
    expect(result.choice.cartLimit).toBe(4);
    expect(result.choice.items).toHaveLength(1);
    expect(api.importGuestCart).not.toHaveBeenCalled();
    expect(loadGuestState().cart).toHaveLength(1);
  });

  it('propagates a failed cart listing instead of guessing and wiping the local cart', async () => {
    saveGuestState({ cart: [line] });
    api.listCarts.mockRejectedValue(new Error('network'));
    await expect(mergeGuestStateIntoAccount('token')).rejects.toThrow('network');
    expect(loadGuestState().cart).toHaveLength(1);
  });

  it('falls back to line-by-line adds, and keeps guest state if any of them fails', async () => {
    saveGuestState({ cart: [line, { ...line, size: 'S' as const }] });
    api.importGuestCart.mockRejectedValue(new Error('import down'));
    api.addToCart.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('stock'));
    api.setCheckoutSelection.mockResolvedValue({});

    await expect(mergeGuestStateIntoAccount('token')).rejects.toThrow('guest_cart_import_failed');
    expect(api.addToCart).toHaveBeenCalledTimes(2);
    expect(loadGuestState().cart).toHaveLength(2);
  });

  it('accepts the fallback when every line and the selection succeed', async () => {
    saveGuestState({ cart: [line] });
    api.importGuestCart.mockRejectedValue(new Error('import down'));
    api.addToCart.mockResolvedValue({});
    api.setCheckoutSelection.mockResolvedValue({});
    await expect(mergeGuestStateIntoAccount('token')).resolves.toEqual({ status: 'done' });
    expect(loadGuestState().cart).toEqual([]);
  });
});

describe('deferred guest cart choice', () => {
  const choice = {
    carts: [],
    cartLimit: 10,
    items: [{ ...line, packKey: '' }],
    extra: [],
    selection: {
      addressId: null,
      billingAddressId: null,
      sameAsBilling: true,
      courierCode: null,
      express: false,
      paymentMethodId: null,
      voucherCode: 'SPRING',
    },
    defaultPaymentMethod: null,
  };

  it('names a new cart with the sentinel when the customer left the name blank', async () => {
    saveGuestState({ cart: [line] });
    await completeGuestCartMerge('token', choice, 'new', undefined, '   ');
    expect(api.importGuestCart.mock.calls[0]?.[1]).toMatchObject({
      mode: 'new',
      name: UNCONNECTED_CART_SENTINEL,
    });
    expect(loadGuestState().cart).toEqual([]);
    expect(takePendingVoucherCode()).toBe('SPRING');
  });

  it('merges into the chosen cart without a name', async () => {
    await completeGuestCartMerge('token', choice, 'merge', 'cart-9', 'ignored');
    const payload = api.importGuestCart.mock.calls[0]?.[1];
    expect(payload).toMatchObject({ mode: 'merge', targetCartId: 'cart-9' });
    expect(payload).not.toHaveProperty('name');
  });

  it('parks the lines in the Unconnected cart when the dialog is dismissed', async () => {
    saveGuestState({ cart: [line] });
    await parkGuestCartAsUnconnected('token', choice);
    expect(api.importGuestCart.mock.calls[0]?.[1]).toMatchObject({ mode: 'unconnected' });
    expect(loadGuestState().cart).toEqual([]);
  });
});
