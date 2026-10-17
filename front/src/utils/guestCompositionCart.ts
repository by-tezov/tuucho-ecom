import type { CartComposition, CompositionFinger, GuestImportComposition, Size } from '../api/cart';
import type { CartCompositionNail } from '../api/contract/cart';
import type { GalleryItem } from '../data/types';
import type { GuestCompositionLine } from '../state/guestCart';
import { cachedNailItem } from './nailItemCache';
import { compositionIsAvailable, compositionUnitPrice } from './composition';
import { isVariationOffered, variationLabel, variationPhotos, variationPrice } from './nailVariation';

function nailFromItem(
  item: GalleryItem,
  shapeKey: string,
  lengthKey: string,
  finger: CompositionFinger,
  size: Size,
  variationKey: string,
): CartCompositionNail {
  const shapeLabel = item.shape[shapeKey] ?? shapeKey;
  const lengthLabel = item.lengthsByShape[shapeKey]?.[lengthKey] ?? lengthKey;
  // A key the nail no longer offers stays as stored, so the line reads
  // unavailable rather than silently becoming another option.
  const photo = variationPhotos(item, shapeKey, lengthKey, variationKey)[0]?.small ?? null;
  return {
    productId: item.id,
    productUid: item.productUid,
    title: item.title,
    shapeKey,
    lengthKey,
    shapeLabel,
    lengthLabel,
    finger,
    variationKey,
    variationLabel: variationLabel(item, variationKey),
    variationAxisLabel: variationKey ? (item.variation?.label ?? '') : '',
    photo,
    unitPrice: variationPrice(item, variationKey) ?? 0,
    available: isVariationOffered(item, shapeKey, lengthKey, size, variationKey),
  };
}

/** Builds cart-shaped compositions for guest localStorage. `itemsById` wins;
 * anything it lacks comes from the tab's nail cache for `lang`
 * (utils/nailItemCache). */
export function guestCompositionsToCart(
  lines: GuestCompositionLine[],
  itemsById: Record<string, GalleryItem>,
  lang: string,
): CartComposition[] {
  return lines.map((line) => {
    const nails: CartCompositionNail[] = line.nails.map((n) => {
      const item = itemsById[n.productId] ?? cachedNailItem(n.productId, lang);
      if (!item) {
        return {
          productId: n.productId,
          productUid: '',
          title: '',
          shapeKey: n.shapeKey,
          lengthKey: n.lengthKey,
          shapeLabel: n.shapeKey,
          lengthLabel: n.lengthKey,
          finger: n.finger,
          variationKey: n.variationKey ?? '',
          variationLabel: '',
          variationAxisLabel: '',
          photo: null,
          unitPrice: 0,
          available: false,
        };
      }
      return nailFromItem(item, n.shapeKey, n.lengthKey, n.finger, line.size, n.variationKey ?? '');
    });
    const unitPrice = compositionUnitPrice(nails);
    return {
      id: line.id,
      size: line.size,
      quantity: line.quantity,
      editing: line.editing === true,
      unitPrice,
      available: compositionIsAvailable(nails),
      nails,
      ...(line.comment ? { comment: line.comment } : {}),
    };
  });
}

/** Write shape for a guest checkout or a login merge. Built from what the
 * cart is already showing rather than re-read from storage, so it cannot
 * drift from the block the customer just confirmed. */
export function compositionsToImportPayload(compositions: CartComposition[]): GuestImportComposition[] {
  return compositions.map(({ size, quantity, nails, comment }) => ({
    size,
    quantity,
    ...(comment ? { comment } : {}),
    nails: nails.map((nail) => ({
      productId: nail.productId,
      shapeKey: nail.shapeKey,
      lengthKey: nail.lengthKey,
      finger: nail.finger,
      variationKey: nail.variationKey,
    })),
  }));
}
