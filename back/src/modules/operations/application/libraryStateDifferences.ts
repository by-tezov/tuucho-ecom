import type { SetColorDetail, SetDetail, SetShapeDetail, SetShapeLengthDetail } from './adminProducts.js';
import type { LibrarySetDesiredState } from './libraryImport.js';
import { jsonRecordEqual } from '../../catalog/domain/accessoryPacks.js';
import type { PartialTrilingual } from '../../../types.js';

function trilingualDiffers(a: PartialTrilingual, b: PartialTrilingual): boolean {
  const langs = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'] as const;
  return langs.some((lang) => (a[lang] ?? '') !== (b[lang] ?? ''));
}

function stringArrayDiffers(a: string[], b: string[]): boolean {
  return a.length !== b.length || a.some((value, i) => value !== b[i]);
}

/** Field-level differences between pamsurin-manager's desired state and the
 * DB. Arrays are compared in display order, not as sets. Keeping the field
 * names lets import callers report every applied change instead of only a
 * generic `updated` flag. */
export function libraryStateDifferences(
  desired: LibrarySetDesiredState,
  current: {
    set: SetDetail;
    shapes: SetShapeDetail[];
    shapeLengths: SetShapeLengthDetail[];
    colors: SetColorDetail[];
  },
): string[] {
  const differences: string[] = [];
  const currentShapeKeys = current.shapes.map((row) => row.shape_key);
  const currentShapeLengths: Record<string, string[]> = {};
  for (const row of current.shapeLengths) {
    (currentShapeLengths[row.shape_key] ??= []).push(row.length_key);
  }
  const currentColorMainKeys = current.colors
    .filter((row) => row.role === 'main')
    .map((row) => row.color_key);
  const currentColorSecondaryKeys = current.colors
    .filter((row) => row.role === 'secondary')
    .map((row) => row.color_key);

  const occasionDiffers =
    desired.occasion === null || current.set.occasion === null
      ? desired.occasion !== current.set.occasion
      : trilingualDiffers(desired.occasion, current.set.occasion);
  const altDiffers =
    desired.alt === null || current.set.alt === null
      ? desired.alt !== current.set.alt
      : trilingualDiffers(desired.alt, current.set.alt);

  if (trilingualDiffers(desired.title, current.set.title)) differences.push('title');
  if (trilingualDiffers(desired.desc, current.set.desc)) differences.push('desc');
  if (occasionDiffers) differences.push('occasion');
  if (altDiffers) differences.push('alt');
  if (stringArrayDiffers(desired.shapeKeys, currentShapeKeys)) differences.push('shape');
  const lengthShapeKeys = new Set([
    ...Object.keys(desired.shapeLengths),
    ...Object.keys(currentShapeLengths),
  ]);
  if (
    [...lengthShapeKeys].some((shapeKey) =>
      stringArrayDiffers(desired.shapeLengths[shapeKey] ?? [], currentShapeLengths[shapeKey] ?? []),
    )
  ) {
    differences.push('length');
  }
  const pairList = (pairs: Array<{ shapeKey: string; lengthKey: string }>) =>
    pairs.map((pair) => `${pair.shapeKey}/${pair.lengthKey}`).sort();
  const currentHidden = current.shapeLengths
    .filter((row) => row.hidden)
    .map((row) => ({ shapeKey: row.shape_key, lengthKey: row.length_key }));
  if (stringArrayDiffers(pairList(desired.hiddenShapeLengths), pairList(currentHidden))) {
    differences.push('hidden-shape-length');
  }
  if (stringArrayDiffers(desired.colorMainKeys, currentColorMainKeys)) differences.push('color-main');
  if (stringArrayDiffers(desired.colorSecondaryKeys, currentColorSecondaryKeys)) {
    differences.push('color-secondary');
  }
  if (desired.hidden !== current.set.hidden) differences.push('hidden');
  if (desired.featuredFrom !== current.set.featured_from) differences.push('featured-from');
  if (desired.featuredFor !== current.set.featured_for) differences.push('featured-for');
  if (desired.creationDate !== current.set.creation_date) differences.push('creation-date');
  if (desired.accessoryType !== current.set.accessory_type) differences.push('accessory-type');
  if (!jsonRecordEqual(desired.accessoryPacks, current.set.accessory_packs))
    differences.push('accessory-packs');
  if (!jsonRecordEqual(desired.accessoryPackPrices, current.set.accessory_pack_prices)) {
    differences.push('accessory-pack-prices');
  }
  if (desired.inCartCarousel !== current.set.in_cart_carousel) differences.push('in-cart-carousel');
  if (desired.loyaltyMultiplier !== Number(current.set.loyalty_multiplier ?? 1))
    differences.push('loyalties');
  return differences;
}
