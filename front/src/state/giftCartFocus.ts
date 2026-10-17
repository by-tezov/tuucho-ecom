const KEY = 'psn-gift-cart-focus';

export function setGiftCartFocus(cartId: string, storage: Storage = sessionStorage): void {
  try {
    storage.setItem(KEY, cartId);
  } catch {
    // Private mode / quota — CartPage still works; the shopper picks the tile.
  }
}

export function peekGiftCartFocus(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function takeGiftCartFocus(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
