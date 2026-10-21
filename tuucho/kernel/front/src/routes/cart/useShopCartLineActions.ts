import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localizedPath } from '../../config/i18nRoutes';
import { lengthAfterShapeChange } from '../../data/galleryShape';
import { type CartItem, type Size } from '../../api/cart';
import type { GalleryItem } from '../../data/types';
import { availableQuantityFor } from '../../utils/availability';
import type { Lang } from '../../assets/i18n/types';
import type { useCartCommands } from '../../hooks/useCart';

type CartCommands = ReturnType<typeof useCartCommands>;

/** Line mutation helpers and last-unit removal dialog state. */
export function useShopCartLineActions(args: {
  status: string;
  lang: Lang;
  gallerySets: Record<string, GalleryItem>;
  addToCart: CartCommands['addToCart'];
  updateCartLine: CartCommands['updateCartLine'];
  removeFromCart: CartCommands['removeFromCart'];
  moveToWishlist: CartCommands['moveToWishlist'];
}) {
  const { status, lang, gallerySets, addToCart, updateCartLine, removeFromCart, moveToWishlist } = args;
  const navigate = useNavigate();
  const [removalTarget, setRemovalTarget] = useState<{
    productId: string;
    shapeKey: string;
    lengthKey: string;
    size: Size | '';
  } | null>(null);

  function closeRemovalDialog() {
    setRemovalTarget(null);
  }

  function confirmMoveToWishlist() {
    if (!removalTarget) return;
    const target = removalTarget;
    closeRemovalDialog();
    if (status !== 'authenticated') {
      navigate(localizedPath('/login', lang), { state: { returnTo: '/cart' } });
      return;
    }
    void moveToWishlist([target]);
  }

  function confirmDeleteFromCart() {
    if (!removalTarget) return;
    const { productId, shapeKey, lengthKey, size } = removalTarget;
    closeRemovalDialog();
    void removeFromCart(productId, shapeKey, lengthKey, size);
  }

  /** "New item": a fresh add-to-cart for the new selection, capped to that
   * (shape, size)'s own stock the same way every other add-to-cart entry
   * point is (see useCart.tsx's addToCart doc comment). The original line
   * is untouched. */
  function handleAddAsNewLine(
    item: CartItem,
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
  ) {
    const set = gallerySets[item.productId];
    const shapeKey = patch.shapeKey ?? item.shapeKey;
    // Changing shape without naming a length lands on the new shape's own
    // default. The old length key may not exist under it at all.
    const lengthKey =
      patch.lengthKey ??
      (shapeKey === item.shapeKey || !set
        ? item.lengthKey
        : lengthAfterShapeChange(set, shapeKey, item.lengthKey));
    const size = patch.size ?? (item.size === '' ? 'M' : item.size);
    void addToCart(
      item.productId,
      shapeKey,
      lengthKey,
      size,
      {
        title: set?.title ?? '',
        photo: set?.photosByShapeLength[shapeKey]?.[lengthKey]?.[0]?.small ?? null,
        price: set?.price,
      },
      patch.quantity ?? 1,
      set ? availableQuantityFor(set.available, shapeKey, lengthKey, size) : Infinity,
      // addToCart otherwise sets the header's global "just added" notice,
      // which is what opens CartControl's drawer. The right affordance
      // from a product card elsewhere on the site, but redundant (and
      // visually odd layered over itself) here: the customer is already
      // looking at the full cart.
      false,
    );
  }

  /** "Replace": moves this line's quantity onto the new selection,
   * merging with whatever's already there if that (shape, size) already
   * exists (see useCart.tsx's updateCartLine doc comment). */
  function handleReplaceLine(
    item: CartItem,
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
  ) {
    const set = gallerySets[item.productId];
    // Same rule as handleAddAsNewLine: a shape change carries the new
    // shape's default length unless one was named explicitly.
    const resolved =
      patch.shapeKey !== undefined && patch.lengthKey === undefined && set
        ? { ...patch, lengthKey: lengthAfterShapeChange(set, patch.shapeKey, item.lengthKey) }
        : patch;
    void updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, resolved);
  }

  return {
    removalTarget,
    setRemovalTarget,
    closeRemovalDialog,
    confirmMoveToWishlist,
    confirmDeleteFromCart,
    handleAddAsNewLine,
    handleReplaceLine,
  };
}
