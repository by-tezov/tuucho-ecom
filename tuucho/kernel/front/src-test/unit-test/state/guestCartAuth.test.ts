import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGuestCart,
  clearGuestState,
  hasGuestData,
  loadGuestState,
  normalizeGuestAddress,
  saveGuestState,
} from '@/state/guestCart';
import { authReturnTo } from '@/state/authCredentialsState';

afterEach(() => {
  clearGuestState();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('guestCart', () => {
  it('normalizes address defaults and persists cart lines', () => {
    const address = normalizeGuestAddress(
      {
        kind: 'livraison',
        line1: '1 rue',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
      },
      'addr-1',
    );
    expect(address.networkCodes).toEqual(['home']);
    expect(address.savedForFuture).toBe(true);

    saveGuestState({
      cart: [{ productId: 'p', shapeKey: 'almond', lengthKey: 'medium', size: 'M', quantity: 1 }],
      favorites: { p: 'almond::medium' },
    });
    expect(loadGuestState().cart).toHaveLength(1);
    expect(hasGuestData(loadGuestState())).toBe(true);
    clearGuestCart();
    expect(loadGuestState().cart).toEqual([]);
    expect(loadGuestState().favorites).toEqual({ p: 'almond::medium' });
  });

  it('drops expired or corrupt storage', () => {
    window.localStorage.setItem(
      'psn-guest-cart-v3',
      JSON.stringify({ expiresAt: Date.now() - 1, state: { cart: [] } }),
    );
    expect(loadGuestState().cart).toEqual([]);
  });
});

describe('authReturnTo', () => {
  it('only resumes allowlisted destinations', () => {
    expect(authReturnTo({ returnTo: '/cart' }, 'fr')).toBe('/fr/cart');
    expect(authReturnTo({ returnTo: '/contact' }, 'en')).toBe('/en/contact');
    expect(authReturnTo({ returnTo: '/admin' }, 'fr')).toMatch(/^\/fr\//);
  });
});
