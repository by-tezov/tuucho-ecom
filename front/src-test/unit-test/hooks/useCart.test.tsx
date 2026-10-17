import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartItem, CartSummary } from '../../../src/api/cart';
import { CartProvider } from '../../../src/hooks/CartProvider';
import { useCartCommands, useCartData } from '../../../src/hooks/useCart';

const testState = vi.hoisted(() => ({
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  listCart: vi.fn(),
  listCarts: vi.fn(),
}));

vi.mock('../../../src/state/AuthContext', () => ({
  useAuthSession: () => ({
    status: 'authenticated',
    user: { id: 'account-a' },
    authedRequest: async <T,>(request: (token: string) => Promise<T>) => request('token'),
  }),
}));
vi.mock('../../../src/assets/i18n', () => ({ useLang: () => ({ lang: 'fr' }) }));
vi.mock('../../../src/state/guestCart', () => ({
  loadGuestState: () => ({ cart: [], favorites: {} }),
  saveGuestState: vi.fn(),
}));
vi.mock('../../../src/api/gallery', () => ({ fetchCartRules: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../src/api/cart', () => ({
  listCart: testState.listCart,
  listCarts: testState.listCarts,
  updateCartItem: testState.updateCartItem,
  removeFromCart: testState.removeFromCart,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe() {
  const { cartReady } = useCartData();
  const { updateCartLine, removeFromCart } = useCartCommands();
  return (
    <div>
      <output data-testid="ready">{String(cartReady)}</output>
      <button
        type="button"
        disabled={!cartReady}
        onClick={() => void updateCartLine('product-1', 'almond', 'short', 'S', { quantity: 2 })}
      >
        Update
      </button>
      <button
        type="button"
        disabled={!cartReady}
        onClick={() => void removeFromCart('product-1', 'almond', 'short', 'S')}
      >
        Remove
      </button>
    </div>
  );
}

describe('CartProvider mutation ordering', () => {
  it('does not let a later removal overtake an in-flight update', async () => {
    const line: CartItem = {
      productId: 'product-1',
      shapeKey: 'almond',
      lengthKey: 'short',
      size: 'S',
      quantity: 1,
    };
    const cart: CartSummary = {
      id: 'cart-1',
      name: 'Cart',
      kind: 'default',
      isActive: true,
      itemCount: 1,
      total: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const update = deferred<{ success: true }>();
    testState.listCarts.mockResolvedValue({ success: true, carts: [cart], cartLimit: 10 });
    testState.listCart.mockResolvedValue({ success: true, items: [line] });
    testState.updateCartItem.mockReturnValue(update.promise);
    testState.removeFromCart.mockResolvedValue({ success: true });

    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(testState.updateCartItem).toHaveBeenCalledOnce());
    expect(testState.removeFromCart).not.toHaveBeenCalled();

    update.resolve({ success: true });
    await waitFor(() => expect(testState.removeFromCart).toHaveBeenCalledOnce());
    expect(testState.updateCartItem.mock.invocationCallOrder[0]).toBeLessThan(
      testState.removeFromCart.mock.invocationCallOrder[0]!,
    );
  });
});
