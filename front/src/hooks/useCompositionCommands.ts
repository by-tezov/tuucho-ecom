import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import * as authApi from '../api/cart';
import type { CartComposition, CompositionWriteBody } from '../api/cart';
import { createReceiverComposition, deleteReceiverComposition, updateReceiverComposition } from '../api/gift';
import type { Lang } from '../assets/i18n';
import {
  loadGuestState,
  newGuestCompositionId,
  saveGuestState,
  type GuestCompositionLine,
} from '../state/guestCart';
import { guestCompositionsToCart } from '../utils/guestCompositionCart';
import type { GalleryItem } from '../data/types';
import type { AuthStatus } from '../state/AuthContext';
import type { GiftReceiverContextValue } from './useGiftReceiver';
import type { JustAddedItem } from './cartContext';

export interface CompositionCommands {
  /** `display` opens the header drawer's "added" notice, like addToCart. */
  addComposition: (body: CompositionWriteBody, display?: JustAddedItem) => Promise<void>;
  updateComposition: (
    id: string,
    body: CompositionWriteBody,
    opts?: { clearEditing?: boolean },
  ) => Promise<void>;
  removeComposition: (id: string) => Promise<void>;
  startCompositionEdit: (id: string) => Promise<void>;
  cancelCompositionEdit: (id: string) => Promise<void>;
  moveCompositionToWishlist: (id: string) => Promise<void>;
  refreshGuestCompositionsView: (itemsById: Record<string, GalleryItem>) => void;
}

interface CompositionCommandsDeps {
  status: AuthStatus;
  gift: GiftReceiverContextValue;
  cartReady: boolean;
  lang: Lang;
  authedRequest: <T>(request: (accessToken: string) => Promise<T>) => Promise<T>;
  enqueueMutation: (mutation: () => Promise<unknown>) => Promise<void>;
  refreshCart: () => void;
  refreshCarts: () => Promise<boolean>;
  setCompositions: Dispatch<SetStateAction<CartComposition[]>>;
  compositionsRef: MutableRefObject<CartComposition[]>;
  /** Shows the header drawer with its success notice (useCart's justAdded). */
  notifyAdded: (display: JustAddedItem) => void;
}

/**
 * Write side of composed nail sets, for the three carts that can hold one:
 * the signed-in account cart (server), a guest's local cart, and a gift cart
 * the receiver is still filling. Split out of CartProvider because it is a
 * self-contained set of commands over the same queue.
 *
 * The edit lock is stored, not held in memory: a guest keeps `editing` in
 * their own cart exactly as the server keeps it on the account row, so
 * leaving the editor without updating or cancelling locks the cart either
 * way.
 */
export function useCompositionCommands(deps: CompositionCommandsDeps): CompositionCommands {
  const {
    status,
    gift,
    cartReady,
    lang,
    authedRequest,
    enqueueMutation,
    refreshCart,
    refreshCarts,
    setCompositions,
    compositionsRef,
    notifyAdded,
  } = deps;

  const refreshGuestCompositionsView = useCallback(
    (itemsById: Record<string, GalleryItem>) => {
      if (status !== 'anonymous' || gift.active) return;
      const next = guestCompositionsToCart(loadGuestState().compositions, itemsById, lang);
      compositionsRef.current = next;
      setCompositions(next);
    },
    [compositionsRef, gift.active, lang, setCompositions, status],
  );

  /** Guest carts hold the whole composition list; every write rewrites it. */
  const writeGuest = useCallback(
    async (next: (lines: GuestCompositionLine[]) => GuestCompositionLine[]) => {
      saveGuestState({ compositions: next(loadGuestState().compositions) });
      await refreshCarts();
    },
    [refreshCarts],
  );

  const addComposition = useCallback(
    async (body: CompositionWriteBody, display?: JustAddedItem) => {
      if (!cartReady) return;
      if (gift.active) {
        if (!gift.canMutate || !gift.token) return;
        const token = gift.token;
        try {
          await enqueueMutation(async () => {
            await createReceiverComposition(token, body);
            await gift.refresh();
          });
          if (display) notifyAdded(display);
        } catch {
          await gift.refresh();
        }
        return;
      }
      if (status === 'anonymous') {
        await writeGuest((lines) => [...lines, { id: newGuestCompositionId(), ...body }]);
        if (display) notifyAdded(display);
        return;
      }
      if (status !== 'authenticated') return;
      await enqueueMutation(() => authedRequest((token) => authApi.createCartComposition(token, body)));
      // Wait for the cart that now holds the set before opening the drawer,
      // or it would open on the previous contents.
      await refreshCarts();
      if (display) notifyAdded(display);
    },
    [authedRequest, cartReady, enqueueMutation, gift, notifyAdded, refreshCarts, status, writeGuest],
  );

  const updateComposition = useCallback(
    async (id: string, body: CompositionWriteBody, opts?: { clearEditing?: boolean }) => {
      if (gift.active) {
        if (!gift.canMutate || !gift.token) return;
        const token = gift.token;
        try {
          await enqueueMutation(async () => {
            await updateReceiverComposition(token, id, body);
            await gift.refresh();
          });
        } catch {
          await gift.refresh();
        }
        return;
      }
      if (status === 'anonymous') {
        await writeGuest((lines) =>
          lines.map((line) =>
            line.id === id ? { ...line, ...body, ...(opts?.clearEditing ? { editing: false } : {}) } : line,
          ),
        );
        return;
      }
      if (status !== 'authenticated') return;
      await enqueueMutation(() =>
        authedRequest((token) =>
          authApi.updateCartComposition(token, id, { ...body, clearEditing: opts?.clearEditing }),
        ),
      );
      // Awaited: the composer goes back to the cart right after, and the
      // cart sends a set still flagged as being modified back to the composer.
      await refreshCart();
    },
    [authedRequest, enqueueMutation, gift, refreshCart, status, writeGuest],
  );

  const removeComposition = useCallback(
    async (id: string) => {
      if (gift.active) {
        if (!gift.canMutate || !gift.token) return;
        const token = gift.token;
        setCompositions((current) => current.filter((entry) => entry.id !== id));
        try {
          await enqueueMutation(async () => {
            await deleteReceiverComposition(token, id);
            await gift.refresh();
          });
        } catch {
          await gift.refresh();
        }
        return;
      }
      if (status === 'anonymous') {
        await writeGuest((lines) => lines.filter((line) => line.id !== id));
        return;
      }
      if (status !== 'authenticated') return;
      setCompositions((current) => current.filter((entry) => entry.id !== id));
      try {
        await enqueueMutation(() => authedRequest((token) => authApi.deleteCartComposition(token, id)));
      } finally {
        refreshCart();
      }
    },
    [authedRequest, enqueueMutation, gift, refreshCart, setCompositions, status, writeGuest],
  );

  const setEditing = useCallback(
    async (id: string, editing: boolean) => {
      if (gift.active) return;
      if (status === 'anonymous') {
        await writeGuest((lines) => lines.map((line) => (line.id === id ? { ...line, editing } : line)));
        return;
      }
      if (status !== 'authenticated') return;
      // Flag it at once: the cart and the composer both route on it (see
      // useCartEditRedirect), the server round trip only confirms it.
      setCompositions((current) => current.map((entry) => (entry.id === id ? { ...entry, editing } : entry)));
      await enqueueMutation(() =>
        authedRequest((token) =>
          editing
            ? authApi.startCartCompositionEdit(token, id)
            : authApi.cancelCartCompositionEdit(token, id),
        ),
      );
      await refreshCart();
    },
    [authedRequest, enqueueMutation, gift.active, refreshCart, setCompositions, status, writeGuest],
  );

  const startCompositionEdit = useCallback((id: string) => setEditing(id, true), [setEditing]);
  const cancelCompositionEdit = useCallback((id: string) => setEditing(id, false), [setEditing]);

  const moveCompositionToWishlist = useCallback(
    async (id: string) => {
      if (status !== 'authenticated') return;
      setCompositions((current) => current.filter((entry) => entry.id !== id));
      try {
        await enqueueMutation(() =>
          authedRequest((token) => authApi.moveCartCompositionToWishlist(token, id)),
        );
      } finally {
        await refreshCarts();
      }
    },
    [authedRequest, enqueueMutation, refreshCarts, setCompositions, status],
  );

  // Memoized so the provider can spread it into its commands context value.
  return useMemo(
    () => ({
      addComposition,
      updateComposition,
      removeComposition,
      startCompositionEdit,
      cancelCompositionEdit,
      moveCompositionToWishlist,
      refreshGuestCompositionsView,
    }),
    [
      addComposition,
      updateComposition,
      removeComposition,
      startCompositionEdit,
      cancelCompositionEdit,
      moveCompositionToWishlist,
      refreshGuestCompositionsView,
    ],
  );
}
