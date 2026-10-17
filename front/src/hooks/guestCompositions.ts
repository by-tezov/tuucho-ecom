import type { CartComposition } from '../api/cart';
import { fetchGalleryNailsFeed } from '../api/gallery';
import type { Lang } from '../assets/i18n';
import type { GuestCompositionLine } from '../state/guestCart';
import { guestCompositionsToCart } from '../utils/guestCompositionCart';
import { cachedNailItem } from '../utils/nailItemCache';

/** A guest cart stores nail ids only. Fetches the nails this tab has not
 * cached for `lang` yet, before the compositions are handed to any surface,
 * so nothing ever draws a blank nail first; cached ones cost no request.
 * A failed fetch still resolves (blank nails): checkout re-prices anyway. */
export async function loadGuestCompositions(
  lines: GuestCompositionLine[],
  lang: Lang,
): Promise<CartComposition[]> {
  const missing = [...new Set(lines.flatMap((line) => line.nails.map((nail) => nail.productId)))].filter(
    (id) => !cachedNailItem(id, lang),
  );
  if (missing.length > 0) {
    await fetchGalleryNailsFeed({ ids: missing, limit: missing.length }, lang).catch(() => undefined);
  }
  return guestCompositionsToCart(lines, {}, lang);
}
