import { useEffect } from 'react';
import { useCartCommands, useCartData } from '../../hooks/useCart';

/** Composition is not part of this shop. Drop a leftover edit so the cart
 * cannot stay locked on a composer that no longer exists. */
export function CartComposeEditNotice() {
  const { editingCompositionId, cartReady } = useCartData();
  const { cancelCompositionEdit } = useCartCommands();

  useEffect(() => {
    if (!cartReady || !editingCompositionId) return;
    void cancelCompositionEdit(editingCompositionId);
  }, [cancelCompositionEdit, cartReady, editingCompositionId]);

  return null;
}
