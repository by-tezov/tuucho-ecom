import { describe, expect, it } from 'vitest';
import {
  nailGalleryDeepLinkPath,
  nailPath,
  productGalleryDeepLinkPath,
  productPath,
  uidFromSlug,
} from '../../../src/utils/productUrl';

describe('product URLs', () => {
  it('addresses a set by its reference alone, lowercased', () => {
    expect(productPath({ productUid: 'AQ-YZ-367' })).toBe('/creations/aq-yz-367');
  });

  it('resolves a generated path back to its uid', () => {
    const path = productPath({ productUid: 'AQ-YZ-367' });
    expect(uidFromSlug(path.replace('/creations/', ''))).toBe('AQ-YZ-367');
  });

  it('still resolves an older title-prefixed slug and a padded uid', () => {
    expect(uidFromSlug('old-title-aq-yz-367')).toBe('AQ-YZ-367');
    expect(uidFromSlug('  AQ-YZ-367 ')).toBe('AQ-YZ-367');
  });

  it('rejects slugs that carry no valid uid', () => {
    expect(uidFromSlug('cerises-elegantes')).toBeUndefined();
    expect(uidFromSlug('cerises-aq-yz-36')).toBeUndefined();
    expect(uidFromSlug('cerises-aq-yz-3678')).toBeUndefined();
    expect(uidFromSlug('')).toBeUndefined();
  });

  it('builds nail pages and share deep links with encoded variation keys', () => {
    const nail = { title: 'Rose poudré', productUid: 'AB-CD-123' };
    expect(nailPath(nail)).toBe('/nail/ab-cd-123');
    expect(nailPath(nail, 'black cherry')).toBe('/nail/ab-cd-123/black%20cherry');
    expect(nailGalleryDeepLinkPath(nail)).toBe('/gallery-nail?product=AB-CD-123');
    expect(nailGalleryDeepLinkPath(nail, 'a&b')).toBe('/gallery-nail?product=AB-CD-123&variation=a%26b');
    expect(productGalleryDeepLinkPath(nail)).toBe('/gallery?product=AB-CD-123');
  });
});
