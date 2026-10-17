import { useEffect } from 'react';
import type { CartItem } from '../api/cart';
import { fetchGalleryFeed, fetchProductsByIds } from '../api/gallery';
import type { Lang } from '../assets/i18n';
import { loadGuestState, saveGuestState } from '../state/guestCart';
import { loadProducts, readProductCache } from '../state/productCache';

/** Drops guest cart lines whose product the catalogue no longer has. */
export function useGuestCartPrune(deps: {
  status: string;
  giftActive: boolean;
  items: CartItem[];
  lang: Lang;
  refreshCart: () => Promise<void>;
}): void {
  const { status, giftActive, items, lang, refreshCart } = deps;
  // Runs here (once, app-wide) rather than only where the cart is displayed,
  // so a line the catalogue has since dropped (a reseed, a discontinued
  // variant) is gone before any surface — the header banner included — ever
  // prices it. loadProducts shares one cache/in-flight request with
  // useCartProductPresentation, so the cart page's own fetch reuses whatever
  // this already started instead of firing a second one.
  useEffect(() => {
    if (status !== 'anonymous' || giftActive) return;
    const productIds = [...new Set(items.map((item) => item.productId))];
    if (productIds.length === 0) return;
    const cached = readProductCache(productIds, lang, 'anon');
    const isColdMiss = cached.missingProductIds.length > 0 || cached.missingSetIds.length > 0;
    let cancelled = false;
    void loadProducts({
      ids: productIds,
      lang,
      audience: 'anon',
      mode: isColdMiss ? 'fill' : 'revalidate',
      fetchProducts: (missing) => fetchProductsByIds(missing, lang),
      fetchSets: (nailIds) =>
        fetchGalleryFeed({ ids: nailIds, limit: nailIds.length }, lang).then((result) => result.items),
    }).then((snapshot) => {
      // Only a successful catalogue response proves the product is gone; a
      // cache read or a failed request must never prune on its own.
      if (cancelled || !snapshot.fromNetwork || snapshot.missingProductIds.length === 0) return;
      const gone = new Set(snapshot.missingProductIds);
      const guestCart = loadGuestState().cart;
      if (guestCart.some((item) => gone.has(item.productId))) {
        saveGuestState({ cart: guestCart.filter((item) => !gone.has(item.productId)) });
        refreshCart();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items, status, giftActive, lang, refreshCart]);
}
