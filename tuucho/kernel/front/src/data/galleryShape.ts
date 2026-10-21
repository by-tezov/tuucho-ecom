import type { GalleryItem } from './types';

/** The default/active shape for a card that hasn't had one explicitly picked
 * yet — the first key in `shape`'s insertion order (see GalleryItem's doc). */
export function defaultShapeKey(item: Pick<GalleryItem, 'shape'>): string {
  return Object.keys(item.shape)[0] ?? '';
}

/** The default/active length for a shape — the first key in that shape's
 * `lengthsByShape` insertion order. Used to initialize a card's active
 * length and to reset it when the active shape changes. Falls back to the
 * literal 'medium' only if a payload somehow carries a shape with no
 * lengths, so a malformed item degrades to one variant instead of an
 * undefined key. */
export function defaultLengthKey(item: Pick<GalleryItem, 'lengthsByShape'>, shapeKey: string): string {
  return Object.keys(item.lengthsByShape?.[shapeKey] ?? {})[0] ?? 'medium';
}

/** The length to show after switching to `shapeKey`: the one already chosen
 * when that shape is offered in it too (short stays short from almond to
 * coffin), else the new shape's own default. */
export function lengthAfterShapeChange(
  item: Pick<GalleryItem, 'lengthsByShape'>,
  shapeKey: string,
  currentLength: string,
): string {
  return item.lengthsByShape?.[shapeKey]?.[currentLength] !== undefined
    ? currentLength
    : defaultLengthKey(item, shapeKey);
}
