import { useCallback, type Dispatch, type SetStateAction } from 'react';
import * as authApi from '../api/cart';
import type { CartItem, CartSummary, Size } from '../api/cart';
import type { AuthStatus } from '../state/AuthContext';
import type { JustAddedItem } from './cartContext';
import { sameLine } from '../utils/cartLines';

interface CartListCommandsDeps {
  status: AuthStatus;
  carts: CartSummary[];
  authedRequest: <T>(request: (accessToken: string) => Promise<T>) => Promise<T>;
  enqueueMutation: (mutation: () => Promise<unknown>) => Promise<void>;
  refreshCarts: () => Promise<boolean>;
  setItems: Dispatch<SetStateAction<CartItem[]>>;
  setJustAdded: Dispatch<SetStateAction<JustAddedItem | null>>;
  setJustRebought: Dispatch<SetStateAction<boolean>>;
  setCartError: Dispatch<SetStateAction<JustAddedItem | null>>;
}

/**
 * Commands about the carts themselves rather than their lines: create,
 * rename, activate, delete, merge, park lines on the wish list, and rebuy a
 * past order into one. All signed-in only — a guest has a single local cart.
 */
export function useCartListCommands(deps: CartListCommandsDeps) {
  const {
    status,
    carts,
    authedRequest,
    enqueueMutation,
    refreshCarts,
    setItems,
    setJustAdded,
    setJustRebought,
    setCartError,
  } = deps;

  const createCart = useCallback(
    async (name?: string) => {
      if (status !== 'authenticated') return;
      // New cart is activated empty — drop previous lines before refresh.
      setItems([]);
      await enqueueMutation(() =>
        authedRequest((token) =>
          authApi.createCart(token, name ? { name, activate: true } : { activate: true }),
        ),
      );
      await refreshCarts();
    },
    [status, authedRequest, enqueueMutation, refreshCarts, setItems],
  );

  const renameCart = useCallback(
    async (cartId: string, name: string) => {
      if (status !== 'authenticated') return;
      await enqueueMutation(() => authedRequest((token) => authApi.renameCart(token, cartId, name)));
      await refreshCarts();
    },
    [status, authedRequest, enqueueMutation, refreshCarts],
  );

  const activateCart = useCallback(
    async (cartId: string) => {
      if (status !== 'authenticated') return;
      // Keep the current cart painted beneath CartSwitcher’s loading overlay
      // until the newly active cart arrives. Clearing here briefly made the
      // page look empty before the replacement lines were available.
      await enqueueMutation(() => authedRequest((token) => authApi.activateCart(token, cartId)));
      await refreshCarts();
    },
    [status, authedRequest, enqueueMutation, refreshCarts],
  );

  const deleteCart = useCallback(
    async (cartId: string) => {
      if (status !== 'authenticated') return;
      await enqueueMutation(() => authedRequest((token) => authApi.deleteCart(token, cartId)));
      await refreshCarts();
    },
    [status, authedRequest, enqueueMutation, refreshCarts],
  );

  const mergeIntoActive = useCallback(
    async (sourceCartId: string) => {
      if (status !== 'authenticated') return;
      const targetId = carts.find((cart) => cart.isActive)?.id;
      if (!targetId) return;
      await enqueueMutation(() =>
        authedRequest((token) => authApi.mergeCarts(token, targetId, sourceCartId)),
      );
      await refreshCarts();
    },
    [status, authedRequest, carts, enqueueMutation, refreshCarts],
  );

  const moveToWishlist = useCallback(
    async (lines: Pick<CartItem, 'productId' | 'shapeKey' | 'lengthKey' | 'size'>[]) => {
      if (status !== 'authenticated' || lines.length === 0) return;
      setItems((current) =>
        current.filter(
          (item) =>
            !lines.some((line) => sameLine(item, line.productId, line.shapeKey, line.lengthKey, line.size)),
        ),
      );
      try {
        await enqueueMutation(() => authedRequest((token) => authApi.moveCartItemsToWishlist(token, lines)));
      } finally {
        await refreshCarts();
      }
    },
    [status, authedRequest, enqueueMutation, refreshCarts, setItems],
  );
  const rebuyOrder = useCallback(
    async (
      orderId: string,
      orderItems: {
        productId: string;
        shapeKey: string;
        size: Size | '';
        quantity: number;
        display: JustAddedItem;
      }[],
      mode: 'new' | 'merge',
      targetCartId?: string,
      name?: string,
      extraDisplay?: JustAddedItem | null,
    ) => {
      if (orderItems.length === 0 && !extraDisplay) return;
      if (status !== 'authenticated') return;
      const trimmedName = name?.trim();
      await enqueueMutation(() =>
        authedRequest(async (token) => {
          if (mode === 'new' && trimmedName) {
            // Named create already exists on POST /account/carts; rebuy's
            // mode=new still hardcodes its own label server-side, so create
            // the named cart first then merge the order lines into it.
            const created = await authApi.createCart(token, { name: trimmedName, activate: true });
            return authApi.rebuyIntoCart(token, orderId, 'merge', created.cart.id);
          }
          return authApi.rebuyIntoCart(token, orderId, mode, targetCartId);
        }),
      );
      const display = orderItems[0]?.display ?? extraDisplay;
      if (!display) return;
      setJustAdded(display);
      setJustRebought(true);
      setCartError(null);
      await refreshCarts();
    },
    [status, authedRequest, enqueueMutation, refreshCarts, setCartError, setJustAdded, setJustRebought],
  );
  return {
    createCart,
    renameCart,
    activateCart,
    deleteCart,
    mergeIntoActive,
    moveToWishlist,
    rebuyOrder,
  };
}
