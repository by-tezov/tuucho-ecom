import { describe, expect, it } from 'vitest';
import { galleryRowIndexForProduct } from '../../../../src/components/gallery/galleryRowIndex';

describe('galleryRowIndexForProduct', () => {
  const items = [{ productUid: 'a' }, { productUid: 'b' }, { productUid: 'c' }, { productUid: 'd' }];

  it('maps an item to its row for the current column count', () => {
    expect(galleryRowIndexForProduct(items, 'c', 2)).toBe(1);
    expect(galleryRowIndexForProduct(items, 'd', 4)).toBe(0);
  });

  it('returns null when the product is not in the loaded grid', () => {
    expect(galleryRowIndexForProduct(items, 'missing', 2)).toBeNull();
    expect(galleryRowIndexForProduct(items, 'a', 0)).toBeNull();
  });
});
