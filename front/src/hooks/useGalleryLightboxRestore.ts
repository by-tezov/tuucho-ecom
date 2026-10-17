import { useCallback, useEffect, useState } from 'react';
import { fetchProductByUid } from '../api/gallery';
import { getReceiverProductByUid } from '../api/gift';
import type { GalleryItem } from '../data/types';
import { useLang } from '../assets/i18n';
import { useOptionalGiftReceiver } from './useGiftReceiver';

export type GalleryLightboxRestore = {
  productUid: string;
  photoIndex: number;
  scrollY?: number;
};

function readFromHistoryState(): GalleryLightboxRestore | null {
  const state = window.history.state as Record<string, unknown> | null;
  const productUid = state?.galleryLightboxProductUid;
  const photoIndex = state?.galleryLightboxPhotoIndex;
  if (typeof productUid !== 'string' || typeof photoIndex !== 'number') return null;
  const scrollY = state?.galleryLightboxScrollY;
  return {
    productUid,
    photoIndex,
    ...(typeof scrollY === 'number' && Number.isFinite(scrollY) ? { scrollY } : {}),
  };
}

/**
 * Reopens the gallery zoom modal after a visitor follows a real-route link
 * from inside it (e.g. Size guide) and comes back. PhotoLightbox tags its
 * own history entry with which product/photo it's showing (see its own
 * comment); this reads that once when GalleryPage mounts — which happens
 * fresh every time platform back lands here, since /gallery and /sizes are
 * sibling routes that fully unmount/remount on navigation between them, so
 * a mount-time read is enough without a separate popstate listener.
 * `clear()` must be called once GalleryPage has opened (and later closed)
 * that lightbox, so an unrelated later mount of the same GalleryPage
 * instance doesn't keep trying to reopen it.
 */
export function useGalleryLightboxRestore(): {
  restore: GalleryLightboxRestore | null;
  clear: () => void;
} {
  const [restore, setRestore] = useState<GalleryLightboxRestore | null>(readFromHistoryState);
  const clear = useCallback(() => setRestore(null), []);
  return { restore, clear };
}

/**
 * The product to show in the restored zoom modal. Prefers the already-loaded
 * feed so the grid can jump to that row; fetches the one set if this page
 * of the catalogue is not in memory yet (so the modal does not wait for
 * the virtualized card to mount).
 */
export function useRestoredLightboxItem(
  restore: GalleryLightboxRestore | null,
  items: GalleryItem[],
): GalleryItem | null {
  const { lang } = useLang();
  const gift = useOptionalGiftReceiver();
  const fromFeed =
    restore == null ? null : (items.find((item) => item.productUid === restore.productUid) ?? null);
  const [fetched, setFetched] = useState<GalleryItem | null>(null);

  useEffect(() => {
    if (!restore || fromFeed) {
      setFetched(null);
      return;
    }
    if (gift.active && !gift.token) return;
    let cancelled = false;
    const load = gift.token
      ? getReceiverProductByUid(gift.token, restore.productUid, lang)
      : fetchProductByUid(restore.productUid, lang);
    void load
      .then((item) => {
        if (!cancelled) setFetched(item);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fromFeed, gift.active, gift.token, lang, restore]);

  return fromFeed ?? fetched;
}
