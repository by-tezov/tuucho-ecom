import { useCallback, useState } from 'react';

export type CartSizePickerRestore = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
};

function readFromHistoryState(): CartSizePickerRestore | null {
  const state = window.history.state as Record<string, unknown> | null;
  const productId = state?.cartSizePickerProductId;
  const shapeKey = state?.cartSizePickerShapeKey;
  const lengthKey = state?.cartSizePickerLengthKey;
  const size = state?.cartSizePickerSize;
  if (
    typeof productId === 'string' &&
    typeof shapeKey === 'string' &&
    typeof lengthKey === 'string' &&
    typeof size === 'string'
  ) {
    return { productId, shapeKey, lengthKey, size };
  }
  return null;
}

/**
 * Reopens a cart line's size picker (SelectionPickerModal) after a visitor
 * follows a real-route link from inside it (Guide des tailles) and comes
 * back. CartLine tags its own history entry with which line/size it's
 * showing (see its own comment); this reads that once when CartPage
 * mounts — which happens fresh every time platform back lands here, since
 * /cart and /sizes are sibling routes that fully unmount/remount on
 * navigation between them, so a mount-time read is enough without a
 * separate popstate listener. `clear()` must be called once the matching
 * CartLine has consumed it (reopened its picker), so an unrelated later
 * mount of the same CartPage instance doesn't keep trying to reopen it.
 * Same pattern as the gallery's own useGalleryLightboxRestore.
 */
export function useCartSizePickerRestore(): {
  restore: CartSizePickerRestore | null;
  clear: () => void;
} {
  const [restore, setRestore] = useState<CartSizePickerRestore | null>(readFromHistoryState);
  const clear = useCallback(() => setRestore(null), []);
  return { restore, clear };
}
