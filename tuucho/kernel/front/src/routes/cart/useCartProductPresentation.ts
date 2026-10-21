import { useEffect, useMemo, useState } from 'react';
import type { Lang } from '../../assets/i18n/types';
import { preferredLanguage } from '../../assets/i18n/languagePreference';
import { fetchGalleryFeed, fetchProductsByIds, type ProductById } from '../../api/gallery';
import { getReceiverGalleryFeed, getReceiverCartProductsByIds } from '../../api/gift';
import type { CartItem } from '../../api/cart';
import type { AuthStatus } from '../../state/AuthContext';
import { audienceForCatalogue, loadProducts, readProductCache } from '../../state/productCache';
import type { GalleryItem } from '../../data/types';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';

type AuthedRequest = <T>(request: (accessToken: string) => Promise<T>) => Promise<T>;

interface UseCartProductPresentationInput {
  items: CartItem[];
  language: Lang;
  status: AuthStatus;
  authedRequest: AuthedRequest;
}

interface CartProductPresentation {
  gallerySets: Record<string, GalleryItem>;
  productsById: Record<string, ProductById>;
  productsReady: boolean;
}

/** Hydrates cart line ids from the shared cache, then refreshes them in the
 * background. This is deliberately separate from cart pricing and checkout:
 * it owns only the product data required to present existing cart lines. */
export function useCartProductPresentation({
  items,
  language,
  status,
  authedRequest,
}: UseCartProductPresentationInput): CartProductPresentation {
  const gift = useOptionalGiftReceiver();
  // Seed from the cache during the first render. Effects run only after paint,
  // so this avoids a one-frame loading flash on a client-side navigation.
  const [initialCached] = useState(() => {
    const audience = audienceForCatalogue(status, gift.active);
    if (!audience) return { productsById: {}, gallerySets: {} };
    const snapshot = readProductCache(
      [...new Set(items.map((item) => item.productId))],
      preferredLanguage(),
      audience,
    );
    return { productsById: snapshot.productsById, gallerySets: snapshot.gallerySets };
  });
  const [gallerySets, setGallerySets] = useState<Record<string, GalleryItem>>(
    () => initialCached.gallerySets,
  );
  const [productsById, setProductsById] = useState<Record<string, ProductById>>(
    () => initialCached.productsById,
  );
  const [presentationSettled, setPresentationSettled] = useState(false);
  const productIdsKey = useMemo(() => [...new Set(items.map((item) => item.productId))].join(','), [items]);
  const productIds = useMemo(() => (productIdsKey === '' ? [] : productIdsKey.split(',')), [productIdsKey]);

  useEffect(() => {
    if (productIds.length === 0) {
      setProductsById({});
      setGallerySets({});
      setPresentationSettled(true);
      return;
    }
    const audience = audienceForCatalogue(status, gift.active);
    // Auth is still resolving (and this is not a gift lock), so waiting
    // prevents data being cached under the wrong audience.
    if (!audience) return;
    const cacheAudience = audience;

    let cancelled = false;
    const langKey = preferredLanguage();
    const cached = readProductCache(productIds, langKey, cacheAudience);
    const isColdMiss = cached.missingProductIds.length > 0 || cached.missingSetIds.length > 0;
    if (!isColdMiss) {
      setProductsById(cached.productsById);
      setGallerySets(cached.gallerySets);
    } else {
      setPresentationSettled(false);
    }

    const fetchProducts = (missing: string[]) =>
      gift.active && gift.token
        ? getReceiverCartProductsByIds(gift.token, missing, langKey)
        : status === 'authenticated'
          ? authedRequest((accessToken) => fetchProductsByIds(missing, langKey, accessToken))
          : fetchProductsByIds(missing, langKey);
    const fetchSets = (nailIds: string[]) =>
      (gift.active && gift.token
        ? getReceiverGalleryFeed(gift.token, langKey, { ids: nailIds, limit: nailIds.length })
        : status === 'authenticated'
          ? authedRequest((accessToken) =>
              fetchGalleryFeed({ ids: nailIds, limit: nailIds.length }, langKey, accessToken),
            )
          : fetchGalleryFeed({ ids: nailIds, limit: nailIds.length }, langKey)
      ).then((result) => result.items);

    async function load() {
      const snapshot = await loadProducts({
        ids: productIds,
        lang: langKey,
        audience: cacheAudience,
        mode: isColdMiss ? 'fill' : 'revalidate',
        fetchProducts,
        fetchSets,
      });
      if (cancelled) return;
      // Pruning a deleted product out of a guest cart happens centrally in
      // useCart.tsx (it runs app-wide, not only while this page is mounted);
      // this hook only ever presents whatever is currently in the cart.
      setProductsById(snapshot.productsById);
      setGallerySets(snapshot.gallerySets);
    }

    void (async () => {
      try {
        await load();
      } catch {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelled) return;
        try {
          await load();
        } catch {
          // The backend-health UI reports the request failure. Settle below so
          // the customer can still see any cached presentation data.
        }
      } finally {
        if (!cancelled) setPresentationSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productIds, language, status, authedRequest, gift.active, gift.token]);

  const productsReady =
    productIds.every((id) => {
      const product = productsById[id];
      return gallerySets[id] !== undefined || product?.productType === 'accessory';
    }) || presentationSettled;

  return { gallerySets, productsById, productsReady };
}
