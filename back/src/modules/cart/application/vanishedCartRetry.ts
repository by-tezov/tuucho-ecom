const CART_OWNED_FKEYS = new Set(['cart_items_cart_id_fkey', 'cart_compositions_cart_id_fkey']);

/** Another session of the same account that places an order deletes the
 * emptied active cart in that transaction (orderConfirmationSupport). A write
 * that read the cart id just before then fails on the cart foreign key. Run
 * it once more: `ensureActiveCart` resolves (or creates) the new active cart. */
export async function retryIfActiveCartVanished<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    if (code !== '23503' || !constraint || !CART_OWNED_FKEYS.has(constraint)) throw error;
    return write();
  }
}

/** `write` with retryIfActiveCartVanished around every call, same signature.
 * Even a cart read writes (its gift-line sync), so reads need it too. */
export function retryOnCartVanish<A extends unknown[], R>(
  write: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => retryIfActiveCartVanished(() => write(...args));
}
