import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { Size } from '../api/cart';
import type { JustAddedItem } from './cartContext';

type AddToCart = (
  productId: string,
  shapeKey: string,
  lengthKey: string,
  size: Size,
  display: JustAddedItem,
  quantity?: number,
  maxQuantity?: number,
  notify?: boolean,
  packKey?: string,
) => Promise<void>;

/**
 * The "adding…" step of every notified add: `pendingAdd` is set the moment
 * the customer taps, so the header drawer opens at once on a loading banner
 * and stays locked until the add settles into the green (`justAdded`) or red
 * (`cartError`) notice. A failure that the add itself did not report turns
 * red here.
 */
export function usePendingAdd(deps: {
  cartReady: boolean;
  addToCartNow: AddToCart;
  setJustAdded: Dispatch<SetStateAction<JustAddedItem | null>>;
  setJustRebought: Dispatch<SetStateAction<boolean>>;
  setCartError: Dispatch<SetStateAction<JustAddedItem | null>>;
}): {
  pendingAdd: JustAddedItem | null;
  addToCart: AddToCart;
  wrapNotifiedAdd: (display: JustAddedItem | undefined, run: () => Promise<void>) => Promise<void>;
} {
  const { cartReady, addToCartNow, setJustAdded, setJustRebought, setCartError } = deps;
  const [pendingAdd, setPendingAdd] = useState<JustAddedItem | null>(null);

  const wrapNotifiedAdd = useCallback(
    async (display: JustAddedItem | undefined, run: () => Promise<void>) => {
      if (!display || !cartReady) return run();
      setPendingAdd(display);
      setJustAdded(null);
      setJustRebought(false);
      setCartError(null);
      try {
        await run();
      } catch (error) {
        setCartError(display);
        throw error;
      } finally {
        setPendingAdd(null);
      }
    },
    [cartReady, setCartError, setJustAdded, setJustRebought],
  );

  const addToCart = useCallback<AddToCart>(
    (productId, shapeKey, lengthKey, size, display, quantity, maxQuantity, notify = true, packKey) => {
      const run = () =>
        addToCartNow(productId, shapeKey, lengthKey, size, display, quantity, maxQuantity, notify, packKey);
      return notify ? wrapNotifiedAdd(display, run) : run();
    },
    [addToCartNow, wrapNotifiedAdd],
  );

  return { pendingAdd, addToCart, wrapNotifiedAdd };
}
