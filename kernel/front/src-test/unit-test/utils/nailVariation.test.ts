import { describe, expect, it } from 'vitest';
import type { GalleryItem } from '@/data/types';
import {
  defaultVariationKey,
  hasVariations,
  firstShapeMissingSize,
  isVariationOffered,
  isVariationOfferedAnySize,
  validVariationKey,
  variationPhotos,
  variationPickerOptions,
  variationPrice,
} from '@/utils/nailVariation';

const plain = {
  price: 4,
  photosByShapeLength: {
    almond: { medium: [{ small: 'plain.webp', modal: 'plain-m.webp' }] },
  },
  available: { almond: { medium: { M: 2 } } },
} as unknown as GalleryItem;

const varied = {
  price: 5,
  variation: {
    label: 'Finition',
    options: [
      { key: 'glossy', label: 'Brillant', price: 6 },
      { key: 'matte', label: 'Mat' },
    ],
  },
  photosByShapeLength: {
    almond: { medium: [{ small: 'fallback.webp', modal: 'fallback-m.webp' }] },
  },
  photosByVariation: {
    almond: {
      medium: {
        glossy: [{ small: 'glossy.webp', modal: 'glossy-m.webp' }],
      },
    },
  },
  available: { almond: { medium: { M: 1, S: 0 } } },
  availableByOption: {
    glossy: { almond: { medium: { M: 2, S: 0 } } },
    matte: { almond: { medium: { M: 0, S: 1 } } },
  },
} as unknown as GalleryItem;

describe('nailVariation without options', () => {
  it('falls back to empty key and shape/length data', () => {
    expect(hasVariations(plain)).toBe(false);
    expect(defaultVariationKey(plain)).toBe('');
    expect(validVariationKey(plain, 'anything')).toBe('');
    expect(variationPhotos(plain, 'almond', 'medium', '')).toEqual([
      { small: 'plain.webp', modal: 'plain-m.webp' },
    ]);
    expect(variationPrice(plain, '')).toBe(4);
    expect(isVariationOffered(plain, 'almond', 'medium', 'M', '')).toBe(true);
    expect(isVariationOffered(plain, 'almond', 'medium', 'S', '')).toBe(false);
  });

  it('picks the first shape that is missing a size', () => {
    const item = {
      shape: { almond: 'Amande', oval: 'Ovale' },
      lengthsByShape: { almond: { medium: 'medium' }, oval: { medium: 'medium' } },
      available: {
        almond: { medium: { XS: 1, S: 1, M: 1, L: 1 } },
        oval: { medium: { XS: 1, M: 1 } },
      },
    } as unknown as GalleryItem;
    expect(firstShapeMissingSize(item, '', ['XS', 'S', 'M', 'L'])).toBe('oval');
  });
});

describe('nailVariation with options', () => {
  it('defaults to the first option and rejects a stale key', () => {
    expect(hasVariations(varied)).toBe(true);
    expect(defaultVariationKey(varied)).toBe('glossy');
    expect(validVariationKey(varied, 'matte')).toBe('matte');
    expect(validVariationKey(varied, 'gone')).toBe('glossy');
    expect(validVariationKey(varied, undefined)).toBe('glossy');
  });

  it('falls back to shape/length photos when the option has none', () => {
    expect(variationPhotos(varied, 'almond', 'medium', 'glossy')).toEqual([
      { small: 'glossy.webp', modal: 'glossy-m.webp' },
    ]);
    expect(variationPhotos(varied, 'almond', 'medium', 'matte')).toEqual([
      { small: 'fallback.webp', modal: 'fallback-m.webp' },
    ]);
  });

  it('reads offered stock for a size and any size', () => {
    expect(isVariationOffered(varied, 'almond', 'medium', 'M', 'glossy')).toBe(true);
    expect(isVariationOffered(varied, 'almond', 'medium', 'S', 'glossy')).toBe(false);
    expect(isVariationOfferedAnySize(varied, 'almond', 'medium', 'matte')).toBe(true);
    expect(isVariationOfferedAnySize(varied, 'almond', 'medium', 'glossy')).toBe(true);
  });

  it('uses the option price override when present', () => {
    expect(variationPrice(varied, 'glossy')).toBe(6);
    expect(variationPrice(varied, 'matte')).toBe(5);
  });

  it('filters picker options by size when known, else by any size', () => {
    expect(variationPickerOptions(varied, 'almond', 'medium', 'M')).toEqual([
      { key: 'glossy', label: 'Brillant', photo: 'glossy.webp' },
    ]);
    expect(variationPickerOptions(varied, 'almond', 'medium', null)).toEqual([
      { key: 'glossy', label: 'Brillant', photo: 'glossy.webp' },
      { key: 'matte', label: 'Mat', photo: 'fallback.webp' },
    ]);
  });
});
