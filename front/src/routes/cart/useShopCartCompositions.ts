import { useCallback, useMemo } from 'react';
import { useCartCommands, useCartData } from '../../hooks/useCart';
import { compositionsToImportPayload } from '../../utils/guestCompositionCart';
import type { CartComposition, GuestImportComposition, Size } from '../../api/cart';
import type { AuthStatus } from '../../state/AuthContext';

/** Cart-page wiring for composed nail sets: the handlers ShopCartLinesSection
 * needs, and the guest payload the checkout call has to carry. Kept out of
 * ShopCartPage so that orchestrator stays about the cart as a whole. */
export function useShopCartCompositions(status: AuthStatus): {
  compositions: CartComposition[];
  /** True while one composition is open in the editor: the rest of the cart
   * cannot be changed and checkout is refused until update or cancel. */
  cartLocked: boolean;
  guestCompositions: GuestImportComposition[];
  handlers: {
    onUpdateComposition: (id: string, size: Size, quantity: number) => void;
    onAddCompositionAsNew: (id: string, size: Size, quantity: number) => void;
    onRemoveComposition: (id: string) => void;
    onMoveCompositionToWishlist: (id: string) => void;
    onStartCompositionEdit: (id: string) => void;
  };
} {
  const { compositions, editingCompositionId } = useCartData();
  const {
    addComposition,
    updateComposition,
    removeComposition,
    moveCompositionToWishlist,
    startCompositionEdit,
  } = useCartCommands();

  // Size and quantity are the only fields the cart itself edits; the nails
  // come back unchanged so the write stays one whole composition, as the
  // API and the guest cart both store it. A nail that stops offering the
  // new size still shows, struck through — same as reopening an older set
  // whose stock has since changed; the full composer is where that gets
  // fixed.
  const onUpdateComposition = useCallback(
    (id: string, size: Size, quantity: number) => {
      const composition = compositions.find((entry) => entry.id === id);
      if (!composition) return;
      void updateComposition(id, {
        size,
        quantity,
        nails: composition.nails.map((nail) => ({
          productId: nail.productId,
          shapeKey: nail.shapeKey,
          lengthKey: nail.lengthKey,
          finger: nail.finger,
          variationKey: nail.variationKey,
        })),
      });
    },
    [compositions, updateComposition],
  );

  // "Nouvel article": a fresh composition with the chosen size/quantity,
  // same nails/fingers as this one — the original stays exactly as it was.
  // No `display`: the customer is already looking at the full cart, same
  // reasoning as useShopCartLineActions' own handleAddAsNewLine for a
  // catalogue set.
  const onAddCompositionAsNew = useCallback(
    (id: string, size: Size, quantity: number) => {
      const composition = compositions.find((entry) => entry.id === id);
      if (!composition) return;
      void addComposition({
        size,
        quantity,
        nails: composition.nails.map((nail) => ({
          productId: nail.productId,
          shapeKey: nail.shapeKey,
          lengthKey: nail.lengthKey,
          finger: nail.finger,
          variationKey: nail.variationKey,
        })),
      });
    },
    [addComposition, compositions],
  );

  const handlers = useMemo(
    () => ({
      onUpdateComposition,
      onAddCompositionAsNew,
      onRemoveComposition: (id: string) => void removeComposition(id),
      onMoveCompositionToWishlist: (id: string) => void moveCompositionToWishlist(id),
      onStartCompositionEdit: (id: string) => void startCompositionEdit(id),
    }),
    [
      moveCompositionToWishlist,
      onAddCompositionAsNew,
      onUpdateComposition,
      removeComposition,
      startCompositionEdit,
    ],
  );

  // Guests have no server cart, so their compositions travel with the
  // checkout call. Derived from the same list the cart renders rather than
  // re-read from storage on every render.
  const guestCompositions = useMemo(
    () => (status === 'anonymous' ? compositionsToImportPayload(compositions) : []),
    [compositions, status],
  );

  return {
    compositions,
    cartLocked: editingCompositionId != null,
    guestCompositions,
    handlers,
  };
}
