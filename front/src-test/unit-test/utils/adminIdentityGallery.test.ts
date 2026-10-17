import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/config/env', () => ({
  shopConfig: { adminRouteToken: 'secret-admin' },
}));

import { adminPath } from '../../../src/utils/adminRoute';
import { galleryItemAsProduct } from '../../../src/utils/galleryItemAsProduct';
import { identityName } from '../../../src/utils/customerIdentity';
import type { GalleryItem } from '../../../src/data/types';

describe('adminPath', () => {
  it('prefixes the deployment token', () => {
    expect(adminPath()).toBe('/secret-admin/admin');
    expect(adminPath('/orders')).toBe('/secret-admin/admin/orders');
  });
});

describe('identityName', () => {
  it('prefers recipient then company', () => {
    expect(identityName('Ada', 'Co')).toBe('Ada');
    expect(identityName(null, 'Co')).toBe('Co');
    expect(identityName(null, null)).toBe('');
  });
});

describe('galleryItemAsProduct', () => {
  it('maps a gallery set to a nail ProductById', () => {
    const item = {
      id: '1',
      productUid: 'uid',
      title: 'T',
      desc: 'D',
      price: 12,
      shape: { almond: 'Amande' },
      lengthsByShape: { almond: { medium: 'Moyen' } },
      photosByShapeLength: {
        almond: { medium: [{ small: 's.webp', modal: 'm.webp' }] },
      },
      available: { almond: { medium: { M: 1 } } },
    } as unknown as GalleryItem;
    expect(galleryItemAsProduct(item)).toMatchObject({
      id: '1',
      productType: 'nail',
      productUid: 'uid',
      photo: 's.webp',
      price: 12,
    });
  });
});
