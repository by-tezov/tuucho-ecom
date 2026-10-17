import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartItem } from '@/api/cart';
import type {
  CartCommandsContextValue,
  CartDataContextValue,
  CartOverlayContextValue,
} from '@/hooks/cartContext';

const auth = vi.hoisted(() => ({
  status: 'anonymous' as 'loading' | 'authenticated' | 'anonymous',
  user: null as { id: string } | null,
}));
const api = vi.hoisted(() => ({
  listCart: vi.fn(),
  listCarts: vi.fn(),
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  fetchCartRules: vi.fn(),
  fetchProductsByIds: vi.fn(),
  fetchGalleryFeed: vi.fn(),
  clearEphemeralAddresses: vi.fn(),
  clearEphemeralCards: vi.fn(),
}));

// A stable authedRequest, like the real provider's useCallback: a fresh one
// per render would re-run the cart load effect forever.
const authedRequest = vi.hoisted(
  () =>
    async <T,>(request: (token: string) => Promise<T>) =>
      request('token'),
);
vi.mock('@/state/AuthContext', () => ({
  useAuthSession: () => ({ status: auth.status, user: auth.user, authedRequest }),
}));
vi.mock('@/assets/i18n', () => ({ useLang: () => ({ lang: 'fr' }) }));
vi.mock('@/api/cart', () => ({
  listCart: api.listCart,
  listCarts: api.listCarts,
  addToCart: api.addToCart,
  updateCartItem: api.updateCartItem,
  removeFromCart: api.removeFromCart,
}));
vi.mock('@/api/gallery', () => ({
  fetchCartRules: api.fetchCartRules,
  fetchProductsByIds: api.fetchProductsByIds,
  fetchGalleryFeed: api.fetchGalleryFeed,
  fetchGalleryNailsFeed: vi.fn(),
}));
vi.mock('@/state/ephemeralAddresses', () => ({
  clearEphemeralAddresses: api.clearEphemeralAddresses,
}));
vi.mock('@/state/ephemeralCards', () => ({ clearEphemeralCards: api.clearEphemeralCards }));

import { CartProvider } from '@/hooks/CartProvider';
import { useCartCommands, useCartData, useCartOverlay } from '@/hooks/useCart';
import { loadGuestState, saveGuestState } from '@/state/guestCart';

const ctx: {
  data?: CartDataContextValue;
  commands?: CartCommandsContextValue;
  overlay?: CartOverlayContextValue;
} = {};

function Probe() {
  ctx.data = useCartData();
  ctx.commands = useCartCommands();
  ctx.overlay = useCartOverlay();
  return null;
}

async function renderReadyCart() {
  render(
    <CartProvider>
      <Probe />
    </CartProvider>,
  );
  await waitFor(() => expect(ctx.data?.cartReady).toBe(true));
}

const display = { title: 'Set', photo: null, price: 20 };
const line = (overrides: Partial<CartItem> = {}): CartItem => ({
  productId: 'p1',
  shapeKey: 'almond',
  lengthKey: 'short',
  size: 'M',
  quantity: 1,
  ...overrides,
});

beforeEach(() => {
  auth.status = 'anonymous';
  auth.user = null;
  api.fetchCartRules.mockResolvedValue([]);
  api.fetchProductsByIds.mockImplementation(async (ids: string[]) =>
    ids.map((id) => ({
      id,
      productType: 'accessory',
      productUid: '',
      title: id,
      desc: '',
      price: 1,
      photo: null,
      available: 9,
    })),
  );
  api.fetchGalleryFeed.mockResolvedValue({ items: [] });
});

afterEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('CartProvider for a guest', () => {
  it('adds to local storage, merges the same variant and caps at the stock limit', async () => {
    await renderReadyCart();
    await act(() => ctx.commands!.addToCart('p1', 'almond', 'short', 'M', display, 2, 3));
    await act(() => ctx.commands!.addToCart('p1', 'almond', 'short', 'M', display, 5, 3));
    expect(loadGuestState().cart).toEqual([{ ...line({ quantity: 3 }), packKey: '' }]);
    expect(ctx.overlay!.justAdded).toEqual(display);

    await act(() => ctx.commands!.addToCart('p1', 'almond', 'short', 'M', display, 1, 3));
    expect(ctx.overlay!.cartError).toEqual(display);
    expect(ctx.overlay!.justAdded).toBeNull();
    expect(loadGuestState().cart[0]?.quantity).toBe(3);
  });

  it('moves a line onto an existing variant by summing quantities', async () => {
    saveGuestState({ cart: [line({ size: 'S', quantity: 1 }), line({ size: 'M', quantity: 2 })] });
    await renderReadyCart();
    await act(() => ctx.commands!.updateCartLine('p1', 'almond', 'short', 'S', { size: 'M' }));
    expect(loadGuestState().cart).toEqual([{ ...line({ size: 'M', quantity: 3 }), packKey: '' }]);
    expect(ctx.data!.items).toEqual([{ ...line({ size: 'M', quantity: 3 }), packKey: '' }]);
  });

  it('previews rule gifts as locked lines that do not count in the badge', async () => {
    api.fetchCartRules.mockResolvedValue([
      {
        code: 'kit',
        kind: 'gift_per_nail_set',
        priority: 1,
        forbidVoucher: false,
        params: { qtyPerNailSetUnit: 1 },
        giftProductId: 'gift-kit',
      },
    ]);
    saveGuestState({ cart: [line({ quantity: 2 })] });
    await renderReadyCart();
    await waitFor(() => expect(ctx.data!.items).toHaveLength(2));
    expect(ctx.data!.items[1]).toMatchObject({
      productId: 'gift-kit',
      quantity: 2,
      origin: 'rule',
      locked: true,
    });
    expect(ctx.data!.cartCount).toBe(2);
    expect(loadGuestState().cart).toHaveLength(1);
  });

  it('ignores edits and removals of a locked rule line', async () => {
    await renderReadyCart();
    api.fetchCartRules.mockResolvedValue([]);
    await act(() => ctx.commands!.removeFromCart('gift-kit', '', '', ''));
    expect(api.removeFromCart).not.toHaveBeenCalled();
  });
});

describe('CartProvider while the session is still restoring', () => {
  it('ignores an add instead of sending it without a token', async () => {
    auth.status = 'loading';
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    expect(ctx.data!.cartReady).toBe(false);
    await act(() => ctx.commands!.addToCart('p1', 'almond', 'short', 'M', display));
    expect(api.addToCart).not.toHaveBeenCalled();
    expect(loadGuestState().cart).toEqual([]);
  });
});

describe('CartProvider for a signed-in customer', () => {
  beforeEach(() => {
    auth.status = 'authenticated';
    auth.user = { id: 'u1' };
    api.listCarts.mockResolvedValue({ carts: [], cartLimit: 10 });
  });

  it('rolls back an optimistic add the server rejects and shows the error notice', async () => {
    api.listCart.mockResolvedValue({ items: [], extra: [] });
    api.addToCart.mockRejectedValue(new Error('sold_out'));
    await renderReadyCart();

    await act(() => ctx.commands!.addToCart('p1', 'almond', 'short', 'M', display));
    await waitFor(() => expect(api.listCart).toHaveBeenCalledTimes(2));
    expect(ctx.data!.items).toEqual([]);
    expect(ctx.overlay!.cartError).toEqual(display);
    expect(ctx.overlay!.justAdded).toBeNull();
  });

  it('never sends an edit or removal of a server rule line', async () => {
    api.listCart.mockResolvedValue({
      items: [
        line(),
        line({ productId: 'gift-kit', shapeKey: '', lengthKey: '', size: '', origin: 'rule', locked: true }),
      ],
    });
    await renderReadyCart();
    await act(() => ctx.commands!.updateCartLine('gift-kit', '', '', '', { quantity: 5 }));
    await act(() => ctx.commands!.removeFromCart('gift-kit', '', '', ''));
    expect(api.updateCartItem).not.toHaveBeenCalled();
    expect(api.removeFromCart).not.toHaveBeenCalled();
  });

  it('forgets one-time addresses and cards once the cart holds no paid line', async () => {
    api.listCart.mockResolvedValue({ items: [line()] });
    await renderReadyCart();
    expect(api.clearEphemeralCards).not.toHaveBeenCalled();

    api.listCart.mockResolvedValue({ items: [] });
    api.removeFromCart.mockResolvedValue({ success: true });
    await act(() => ctx.commands!.removeFromCart('p1', 'almond', 'short', 'M'));
    await waitFor(() => expect(api.clearEphemeralCards).toHaveBeenCalled());
    expect(api.clearEphemeralAddresses).toHaveBeenCalled();
  });

  it('counts other non-empty carts in hasCartItems even when the active one is empty', async () => {
    api.listCart.mockResolvedValue({ items: [] });
    api.listCarts.mockResolvedValue({
      carts: [
        {
          id: 'a',
          name: 'A',
          kind: 'default',
          isActive: true,
          itemCount: 0,
          total: 0,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b',
          name: 'B',
          kind: 'named',
          isActive: false,
          itemCount: 2,
          total: 40,
          createdAt: '',
          updatedAt: '',
        },
      ],
      cartLimit: 3,
    });
    await renderReadyCart();
    expect(ctx.data!).toMatchObject({ cartCount: 0, hasCartItems: true, cartLimit: 3 });
    expect(ctx.data!.activeCart?.id).toBe('a');
  });
});
