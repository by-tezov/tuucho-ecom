/**
 * The cart's consumer API: what `useCartData`, `useCartCommands` and
 * `useCartOverlay` return, and the three contexts carrying it. Split from the
 * provider (hooks/CartProvider.tsx), which is the implementation and is only
 * mounted by the app entry points: a component that reads the cart depends on
 * this contract, never on how the provider keeps it.
 */
import { createContext } from 'react';
import type { CartItem, CartSummary, Size } from '../api/cart';

/** Display info for the "added to cart" modal — the caller (PhotoLightbox)
 * already has the full GalleryItem at hand, so it passes
 * along what to show rather than this context re-fetching it. */
export interface JustAddedItem {
  title: string;
  photo: string | null;
  price: number | undefined;
}

export interface CartContextValue {
  items: CartItem[];
  /** Opaque plugin extra-set rows. Kernel cart never reads their shape. */
  extraSets: unknown[];
  extraUnitCount: number;
  extraLocked: boolean;
  carts: CartSummary[];
  /** Server-configured limit for carts other than default and Wish List. */
  cartLimit: number;
  activeCart: CartSummary | null;
  /** True once the current auth session's initial cart/list requests have
   * completed successfully and their results have been applied. Prevents consumers from
   * mistaking the provider's initial empty arrays for a genuinely empty cart. */
  cartReady: boolean;
  /** Quantity of user-added lines only — locked gift / rule lines are excluded. */
  cartCount: number;
  /** True when the active cart has lines, or any other named cart still
   * holds items — drives burger accent, header/FAB attention wave, and
   * mobile FAB visibility. */
  hasCartItems: boolean;
  isInCart: (productId: string) => boolean;
  /** First line for this product, regardless of variant — used purely to
   * seed a default shape/length/size for display (NewArrivalCard,
   * GalleryCard, PhotoLightbox). Use getCartLineFor for a specific
   * (shape, length, size). */
  getCartLine: (productId: string) => CartItem | undefined;
  /** Exact-match lookup — the line for this precise (product, shape,
   * length, size), if one exists. A product can now hold several lines at
   * once. */
  getCartLineFor: (
    productId: string,
    shapeKey: string,
    lengthKey: string,
    size: Size | '',
  ) => CartItem | undefined;
  /** Quick add/remove toggle — the card's top-right cart icon. `size` is
   * the caller's choice (CartButton picks the variant's first in-stock
   * size); use the modal's addToCart for a deliberate size choice instead.
   * `maxQuantity` is the caller's own `availableQuantityFor(...)` result for
   * that shape/length/size — see addToCart below. Removing (already in
   * cart) drops every line for this product, regardless of variant — there's
   * no single "the" variant to point at from this button's perspective. */
  toggleCart: (
    productId: string,
    shapeKey: string,
    lengthKey: string,
    size: Size,
    display: JustAddedItem,
    maxQuantity?: number,
  ) => void;
  /** Deliberate add (the lightbox's bottom-sheet CTA) — increments quantity
   * on the matching (product, shape, length, size) line, or creates a new
   * one; a different shape, length or size for the same product is a
   * separate line, never an overwrite. `maxQuantity` (the caller's
   * `availableQuantityFor(item.available, shapeKey, lengthKey, size)`) caps
   * how much *this exact line* is allowed to hold in total: with `n`
   * already on it, at most `maxQuantity - n` of `quantity` actually gets
   * added, and if that's zero or negative nothing is added at all and
   * `cartError` is set instead of `justAdded` — the request never reaches
   * the server. */
  addToCart: (
    productId: string,
    shapeKey: string,
    lengthKey: string,
    size: Size,
    display: JustAddedItem,
    quantity?: number,
    maxQuantity?: number,
    /** false skips justAdded/cartError entirely — see the cart page's
     * "add as new line" action, which doesn't want the header drawer
     * popping up over the cart the customer is already looking at. */
    notify?: boolean,
    /** byQuantity pack; empty for nails and default accessories. Repeat add
     * increments qty; a different pack replaces packKey on the same line. */
    packKey?: string,
    /** Resolves once settled — instantly for a signed-out guest (pure
     * localStorage write), after the POST /account/cart round trip for a
     * signed-in shopper. Most callers still fire-and-forget it; the
     * accessory carousel awaits it to know when its own loading dialog can
     * close (see CartAccessoryCard.tsx). */
  ) => Promise<void>;
  /** `shapeKey`/`lengthKey`/`size` identify which line to edit — a product
   * can have several now. A `{quantity}`-only patch is an absolute set (not
   * additive), backing the cart page's quantity stepper. A patch carrying a
   * new `shapeKey`, `lengthKey` and/or `size` moves this line's quantity
   * onto that new selection, merging with an existing line there if one
   * already exists — the cart page's change-selection modal drives this
   * path. */
  updateCartLine: (
    productId: string,
    shapeKey: string,
    lengthKey: string,
    size: Size | '',
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number; packKey: string }>,
  ) => Promise<void>;
  /** Resolves once settled — same reasoning as addToCart's own doc comment:
   * instant for a signed-out guest, after the DELETE /account/cart round
   * trip for a signed-in shopper. Most callers still fire-and-forget it;
   * AccessoryCartLine awaits it for its own loading dialog. */
  removeFromCart: (productId: string, shapeKey: string, lengthKey: string, size: Size | '') => Promise<void>;
  refreshCart: () => void;
  /** Refresh the cart list summaries and the active cart's items together.
   * Other carts stay summary-only until activated. */
  /** Revalidates summaries and active-cart lines. `beforeApplyChange` runs
   * only when fresh server data differs from what is currently displayed. */
  refreshCarts: (options?: { beforeApplyChange?: () => Promise<void> }) => Promise<boolean>;
  createCart: (name?: string) => Promise<void>;
  renameCart: (cartId: string, name: string) => Promise<void>;
  activateCart: (cartId: string) => Promise<void>;
  deleteCart: (cartId: string) => Promise<void>;
  /** Merge `sourceCartId` into the currently active cart. */
  mergeIntoActive: (sourceCartId: string) => Promise<void>;
  moveToWishlist: (lines: Pick<CartItem, 'productId' | 'shapeKey' | 'lengthKey' | 'size'>[]) => Promise<void>;
  /** Customer note on one cart card (every size line of a
   * product+shape+length); '' removes it. See useCartCommentCommands. */
  setCardComment: (
    card: { productId: string; shapeKey: string; lengthKey: string },
    comment: string,
  ) => Promise<void>;
  /** Plugin extra-set writers replace the opaque extra list after a local write. */
  setExtraSets: (next: unknown[]) => void;
  /** Set right after a successful add — drives the header's "added to
   * cart" modal (photo/title/price + continue shopping / go to cart).
   * Cleared by the modal itself or the next navigation. */
  justAdded: JustAddedItem | null;
  dismissJustAdded: () => void;
  /** True when the drawer was opened by a successful rebuy (not a normal
   * add). CartControl hides "continue shopping" for that case. Cleared with
   * `dismissJustAdded`. */
  justRebought: boolean;
  /** Set instead of justAdded when addToCart/toggleCart couldn't add
   * anything (the line is already at, or the size/shape has, 0 room) —
   * drives the same drawer with a red "not added" notice instead of the
   * green one. */
  cartError: JustAddedItem | null;
  dismissCartError: () => void;
  /** An add in flight: the drawer shows it as a locked loading banner. */
  pendingAdd: JustAddedItem | null;
  /** Authenticated rebuy via POST /account/carts/rebuy. `items` are
   * display-only (drawer notice); the server decides what actually lands.
   * Rejects on API failure (e.g. `cart_limit_exceeded`) so callers can show UI. */
  rebuyOrder: (
    orderId: string,
    items: {
      productId: string;
      shapeKey: string;
      size: Size | '';
      quantity: number;
      display: JustAddedItem;
    }[],
    mode: 'new' | 'merge',
    targetCartId?: string,
    /** Required for mode `'new'` — creates a named cart then rebuys into it. */
    name?: string,
    /** Drawer preview when the order only has extra-set lines (no catalogue lines). */
    extraDisplay?: JustAddedItem | null,
  ) => Promise<void>;
  /** Lets an open product modal (PhotoLightbox) hand over its own close
   * function while it's open — so the header cart drawer can dismiss the
   * zoom behind it on "continue shopping". Add-from-zoom closes the modal
   * itself before this drawer opens. */
  /** True while a product lightbox (or similar) has registered its close
   * handler — used to hide the mobile cart FAB over that modal, and to
   * delay the just-added drawer until the zoom has unmounted. */
  hasActiveModal: boolean;
  registerModalClose: (close: (() => void) | null) => void;
  closeActiveModal: () => void;
}

export type CartDataContextValue = Pick<
  CartContextValue,
  | 'items'
  | 'extraSets'
  | 'extraUnitCount'
  | 'extraLocked'
  | 'carts'
  | 'cartLimit'
  | 'activeCart'
  | 'cartReady'
  | 'cartCount'
  | 'hasCartItems'
  | 'isInCart'
  | 'getCartLine'
  | 'getCartLineFor'
>;
export type CartCommandsContextValue = Pick<
  CartContextValue,
  | 'toggleCart'
  | 'addToCart'
  | 'updateCartLine'
  | 'removeFromCart'
  | 'refreshCart'
  | 'refreshCarts'
  | 'createCart'
  | 'renameCart'
  | 'activateCart'
  | 'deleteCart'
  | 'mergeIntoActive'
  | 'moveToWishlist'
  | 'rebuyOrder'
  | 'setCardComment'
  | 'setExtraSets'
>;
export type CartOverlayContextValue = Pick<
  CartContextValue,
  | 'justAdded'
  | 'dismissJustAdded'
  | 'justRebought'
  | 'cartError'
  | 'dismissCartError'
  | 'pendingAdd'
  | 'hasActiveModal'
  | 'registerModalClose'
  | 'closeActiveModal'
>;

export const CartDataContext = createContext<CartDataContextValue | null>(null);
export const CartCommandsContext = createContext<CartCommandsContextValue | null>(null);
export const CartOverlayContext = createContext<CartOverlayContextValue | null>(null);
