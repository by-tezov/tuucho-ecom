import type { Size } from '../api/cart';
import type { GalleryItem, GalleryPhoto } from '../data/types';

/**
 * Reading a single nail's variation axis (docs/plans/nail-variations.md in
 * kernel/back). Every helper also works on an item without variations, so
 * callers never branch: the variation key is then `''` and everything falls
 * back to the shape/length data.
 */

export function hasVariations(item: Pick<GalleryItem, 'variation'>): boolean {
  return (item.variation?.options.length ?? 0) > 0;
}

/** The option the item opens on: the one the API opened it on
 * (`initialVariation`, from a `?variation=` link or a matched filter), else
 * the first. Its photos stand in for the nail elsewhere; `''` without
 * variations. */
export function defaultVariationKey(item: Pick<GalleryItem, 'variation' | 'initialVariation'>): string {
  const initial = item.initialVariation;
  if (initial && item.variation?.options.some((option) => option.key === initial)) return initial;
  return item.variation?.options[0]?.key ?? '';
}

/**
 * The item as the given option: each option of a single nail is its own
 * product (kernel/back docs/plans/nail-variation-copy.md), so its title,
 * description, alt text, occasion and colours replace the item's. Returns the
 * item itself without variations or for an unknown key, so callers never
 * branch.
 */
export function itemForVariation<T extends GalleryItem>(item: T, variationKey: string): T {
  const option = variationKey
    ? item.variation?.options.find((entry) => entry.key === variationKey)
    : undefined;
  if (!option) return item;
  // The option's photos and price stand in for the nail's, so anything that
  // reads the item (structured data, share preview) describes this option.
  const photosByShapeLength: GalleryItem['photosByShapeLength'] = {};
  for (const [shapeKey, byLength] of Object.entries(item.photosByShapeLength)) {
    photosByShapeLength[shapeKey] = {};
    for (const lengthKey of Object.keys(byLength)) {
      photosByShapeLength[shapeKey][lengthKey] = variationPhotos(item, shapeKey, lengthKey, option.key);
    }
  }
  return {
    ...item,
    photosByShapeLength,
    // No item price means prices are hidden (gift): keep them hidden.
    ...(item.price === undefined ? {} : { price: option.price ?? item.price }),
    title: option.title,
    desc: option.desc,
    descTemplate: option.descTemplate,
    alt: option.alt,
    altTemplate: option.altTemplate,
    occasion: option.occasion,
    colorMain: option.colorMain,
    colorSecondary: option.colorSecondary,
  };
}

/** A remembered key (favorite, draft) when it is still one of the item's
 * options, else the default. */
export function validVariationKey(item: Pick<GalleryItem, 'variation'>, key: string | undefined): string {
  if (!hasVariations(item)) return '';
  return key && item.variation!.options.some((option) => option.key === key)
    ? key
    : defaultVariationKey(item);
}

export function variationPhotos(
  item: Pick<GalleryItem, 'photosByShapeLength' | 'photosByVariation'>,
  shapeKey: string,
  lengthKey: string,
  variationKey: string,
): GalleryPhoto[] {
  if (variationKey) {
    const photos = item.photosByVariation?.[shapeKey]?.[lengthKey]?.[variationKey];
    if (photos && photos.length > 0) return photos;
  }
  return item.photosByShapeLength[shapeKey]?.[lengthKey] ?? [];
}

/** Offered for this exact shape × length × size × option. */
export function isVariationOffered(
  item: Pick<GalleryItem, 'available' | 'availableByOption'>,
  shapeKey: string,
  lengthKey: string,
  size: Size,
  variationKey: string,
): boolean {
  const grid = variationKey ? item.availableByOption?.[variationKey] : item.available;
  return (grid?.[shapeKey]?.[lengthKey]?.[size] ?? 0) > 0;
}

/** First shape that is not made in every `sizes` entry, in display order.
 * Compose opens on it so a missing size is visible before the customer adds
 * the nail. Undefined when every shape offers every size. */
export function firstShapeMissingSize(
  item: Pick<GalleryItem, 'shape' | 'lengthsByShape' | 'available' | 'availableByOption'>,
  variationKey: string,
  sizes: readonly Size[],
): string | undefined {
  for (const shapeKey of Object.keys(item.shape)) {
    for (const lengthKey of Object.keys(item.lengthsByShape[shapeKey] ?? {})) {
      if (sizes.some((size) => !isVariationOffered(item, shapeKey, lengthKey, size, variationKey))) {
        return shapeKey;
      }
    }
  }
  return undefined;
}

/** Offered in at least one size for this shape × length (greys an option in
 * a picker that has no set size yet). */
export function isVariationOfferedAnySize(
  item: Pick<GalleryItem, 'available' | 'availableByOption'>,
  shapeKey: string,
  lengthKey: string,
  variationKey: string,
): boolean {
  const grid = variationKey ? item.availableByOption?.[variationKey] : item.available;
  return Object.values(grid?.[shapeKey]?.[lengthKey] ?? {}).some((value) => (value ?? 0) > 0);
}

/** The option's price override, else the item price. */
export function variationPrice(
  item: Pick<GalleryItem, 'price' | 'variation'>,
  variationKey: string,
): number | undefined {
  const override = item.variation?.options.find((option) => option.key === variationKey)?.price;
  return override ?? item.price;
}

export function variationLabel(item: Pick<GalleryItem, 'variation'>, variationKey: string): string {
  return item.variation?.options.find((option) => option.key === variationKey)?.label ?? '';
}

/** The picker's option list for the nail's current shape and length, with
 * each option's photo. An option switched off there (or for `size`, when the
 * set size is known) is left out. */
export function variationPickerOptions(
  item: Pick<
    GalleryItem,
    'variation' | 'photosByShapeLength' | 'photosByVariation' | 'available' | 'availableByOption' | 'price'
  >,
  shapeKey: string,
  lengthKey: string,
  size: Size | null,
): Array<{ key: string; label: string; photo: string | null }> {
  return (item.variation?.options ?? [])
    .filter((option) =>
      size
        ? isVariationOffered(item, shapeKey, lengthKey, size, option.key)
        : isVariationOfferedAnySize(item, shapeKey, lengthKey, option.key),
    )
    .map((option) => ({
      key: option.key,
      label: option.label,
      photo: variationPhotos(item, shapeKey, lengthKey, option.key)[0]?.small ?? null,
    }));
}

/** The photo slider of a single nail with variations: one slide per option
 * the picker offers (same list, same order, so swiping and picking always
 * agree), each showing that option's first photo in the current shape and
 * length. `index` is the active option's slide, 0 when it is not offered. */
export function variationSlides(
  item: Pick<
    GalleryItem,
    'variation' | 'photosByShapeLength' | 'photosByVariation' | 'available' | 'availableByOption' | 'price'
  >,
  shapeKey: string,
  lengthKey: string,
  size: Size | null,
  activeKey: string,
): { keys: string[]; photos: GalleryPhoto[]; index: number } {
  const slides = variationPickerOptions(item, shapeKey, lengthKey, size)
    .map((option) => ({ key: option.key, photo: variationPhotos(item, shapeKey, lengthKey, option.key)[0] }))
    .filter((slide): slide is { key: string; photo: GalleryPhoto } => !!slide.photo);
  const index = slides.findIndex((slide) => slide.key === activeKey);
  return {
    keys: slides.map((slide) => slide.key),
    photos: slides.map((slide) => slide.photo),
    index: Math.max(index, 0),
  };
}
