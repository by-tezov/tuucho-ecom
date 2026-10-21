import type { CartSummary } from '../api/cart';
import type { Lang, Strings } from '../assets/i18n/types';
import { FIELD_CART_NAME_MAX } from './fieldLimits';

/** Max length for user-editable cart names (create / rename / rebuy). */
export const CART_NAME_MAX_LENGTH = FIELD_CART_NAME_MAX;

/**
 * Whether `count` should use the singular form for this language. Follows
 * CLDR “one”: FR/PT treat 0 and 1 as singular; EN/ES/IT/NL only 1; TH has no
 * inflection (singular/plural templates are identical, so this is moot but
 * still returns a value). Shared by any singular/plural pair keyed on a
 * count, not just cart item counts (see e.g. OrdersList.tsx's item-group
 * section labels).
 */
export function usesSingularItemCount(count: number, lang: Lang): boolean {
  return lang === 'fr' ? count <= 1 : count === 1;
}

/** Localized “N article(s)” / “N item(s)” for cart tiles and titles. */
export function formatCartItemCount(count: number, t: Strings, lang: Lang): string {
  const template = usesSingularItemCount(count, lang) ? t.cart.cartItemCount : t.cart.cartItemsCount;
  return template.replace('{count}', String(count));
}

/**
 * Compatibility fallback while rolling out a backend that predates the
 * `cartLimit` field on GET /account/carts. The server remains authoritative.
 */
export const DEFAULT_CART_MAX_PER_USER = 10;

/** Carts the customer never created explicitly — labelled from their kind and
 * outside the cart budget. Mirrors the API's isSystemCartKind. */
export function isSystemCartKind(kind: CartSummary['kind']): boolean {
  return kind === 'default' || kind === 'wishlist' || kind === 'unconnected' || kind === 'gift';
}

export function limitedCartCount(carts: readonly Pick<CartSummary, 'kind'>[]): number {
  return carts.filter((cart) => !isSystemCartKind(cart.kind)).length;
}

/** Localized body for the ordinary-cart limit dialog. */
export function cartLimitMessage(t: Strings, cartLimit = DEFAULT_CART_MAX_PER_USER): string {
  return t.cart.cartLimitError.replace('{max}', String(cartLimit));
}

/** Newest-created first — shared order for cart tiles and merge pickers.
 * ISO `createdAt` strings compare lexicographically in chronological order. */
export function sortCartsByCreatedAtDesc<T extends { createdAt: string }>(carts: readonly T[]): T[] {
  return [...carts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** English sentinel stored by the API for the account default cart. */
const DEFAULT_CART_SENTINEL = 'default cart';

/** English sentinel used when landing a guest cart as a new named cart. */
export const UNCONNECTED_CART_SENTINEL = 'unconnected cart';

/** English fallback name the API uses for untitled custom carts. */
const NEW_CART_SENTINEL = 'new cart';

/** Legacy typo still present in older locale placeholders / possible DB rows. */
const UNCONNECTED_CART_SENTINEL_LEGACY = 'unconnect cart';

/**
 * Customer-facing cart label. System carts are mapped by `kind` (and known
 * English sentinel `name`s from the API) so the UI stays localized; user-
 * chosen custom / rebuy names are shown as stored.
 */
export function cartDisplayName(
  cart: Pick<CartSummary, 'kind' | 'name'> & Partial<Pick<CartSummary, 'gift'>>,
  t: Strings,
): string {
  const trimmed = cart.name.trim();
  const lower = trimmed.toLowerCase();

  // Guest / unconnected sentinel wins even if kind was stored as `default`
  // (import-guest currently tags mode=new as kind default).
  if (
    cart.kind === 'unconnected' ||
    lower === UNCONNECTED_CART_SENTINEL ||
    lower === UNCONNECTED_CART_SENTINEL_LEGACY
  ) {
    return t.cart.guestCartName;
  }
  if (cart.kind === 'default' || lower === DEFAULT_CART_SENTINEL) {
    return t.cart.defaultCartName;
  }
  if (cart.kind === 'wishlist') {
    return t.cart.wishlistCartName;
  }
  if (cart.kind === 'gift') {
    const receiver = cart.gift?.receiverName?.trim();
    const stored = trimmed;
    const seeded = receiver ? `Cadeau pour ${receiver}`.slice(0, CART_NAME_MAX_LENGTH) : '';
    if (stored && stored !== seeded) return stored;
    return receiver ? t.gift.cartTileName.replace('{name}', receiver) : t.gift.cartTileFallback;
  }
  if (lower === NEW_CART_SENTINEL) {
    return t.cart.createCartDialogTitle;
  }
  return trimmed;
}
