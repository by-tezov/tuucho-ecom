import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProductByUid } from '../api/gallery';
import { defaultLengthKey, defaultShapeKey } from '../data/galleryShape';
import type { GalleryItem } from '../data/types';
import type { Lang } from '../assets/i18n';
import { noteProductShareLanding } from '../state/onboardingGate';

/**
 * Opens the zoom modal straight from a /gallery?product=<uid> link (the
 * lightbox's own share button — see productGalleryDeepLinkPath and
 * PhotoLightbox.tsx) without depending on that product already being loaded
 * into the paginated/virtualized grid (see useGalleryFeed's cursor-based
 * pagination) — it fetches the one set directly, the same call
 * ProductPage.tsx uses to resolve /creations/<slug>. The query param is
 * stripped once the fetch settles (found or not) so a refresh/back doesn't
 * refetch or reopen it. Onboarding stays deferred for this gallery visit so
 * the shared product is not covered by the intro overlay.
 */
export function useGalleryProductDeepLink(
  lang: Lang,
  /** `fetchNailByUid` on /gallery-nail, whose share links point at a single
   * nail rather than a set. */
  fetchItem: (uid: string, lang: Lang) => Promise<GalleryItem | null> = fetchProductByUid,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const uid = searchParams.get('product');
  const [item, setItem] = useState<GalleryItem | null>(null);
  const [activeShape, setActiveShape] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!uid) return;
    noteProductShareLanding();
    let cancelled = false;
    fetchItem(uid, lang).then((fetched) => {
      if (cancelled) return;
      if (fetched) {
        setItem(fetched);
        setActiveShape(defaultShapeKey(fetched));
        setIndex(0);
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('product');
          return next;
        },
        { replace: true },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [uid, lang, setSearchParams, fetchItem]);

  function selectShape(key: string) {
    if (!item || key === activeShape) return;
    const nextPhotos = item.photosByShapeLength[key]?.[defaultLengthKey(item, key)] ?? [];
    setActiveShape(key);
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  }

  return {
    item,
    activeShape,
    activeLength: item ? defaultLengthKey(item, activeShape) : '',
    index,
    setIndex,
    selectShape,
    close: () => setItem(null),
  };
}
