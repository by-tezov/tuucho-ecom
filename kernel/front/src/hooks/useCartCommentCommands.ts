import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import * as authApi from '../api/cart';
import type { CartItem } from '../api/cart';
import { loadGuestState, saveGuestState } from '../state/guestCart';
import type { AuthStatus } from '../state/AuthContext';
import { withCardComment } from '../utils/cartComment';
import type { GiftReceiverContextValue } from './useGiftReceiver';

export interface CartCommentCommands {
  /** Note on one cart card (every size line of a product+shape+length).
   * '' removes it. */
  setCardComment: (
    card: { productId: string; shapeKey: string; lengthKey: string },
    comment: string,
  ) => Promise<void>;
}

interface CartCommentCommandsDeps {
  status: AuthStatus;
  gift: GiftReceiverContextValue;
  authedRequest: <T>(request: (accessToken: string) => Promise<T>) => Promise<T>;
  enqueueMutation: (mutation: () => Promise<unknown>) => Promise<void>;
  refreshCart: () => void;
  setItems: Dispatch<SetStateAction<CartItem[]>>;
}

/**
 * Customer notes on cart cards ("+ Ajouter un commentaire"). A guest keeps
 * them in local storage with the lines; the account cart writes them through
 * the queue like any other cart mutation, applied optimistically and
 * re-listed on failure. A gift receiver's cart has no notes.
 */
export function useCartCommentCommands(deps: CartCommentCommandsDeps): CartCommentCommands {
  const { status, gift, authedRequest, enqueueMutation, refreshCart, setItems } = deps;

  const setCardComment = useCallback<CartCommentCommands['setCardComment']>(
    async (card, comment) => {
      if (gift.active) return;
      const trimmed = comment.trim();
      if (status === 'anonymous') {
        const next = withCardComment(loadGuestState().cart, card, trimmed);
        saveGuestState({ cart: next });
        setItems(next);
        return;
      }
      if (status !== 'authenticated') return;
      setItems((current) => withCardComment(current, card, trimmed));
      try {
        await enqueueMutation(() =>
          authedRequest((token) => authApi.setCartCardComment(token, card, trimmed || null)),
        );
      } catch {
        refreshCart();
      }
    },
    [authedRequest, enqueueMutation, gift.active, refreshCart, setItems, status],
  );

  return useMemo(() => ({ setCardComment }), [setCardComment]);
}
