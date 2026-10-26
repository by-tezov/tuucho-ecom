import { describe, expect, it } from 'vitest';
import {
  addCataloguePhoto,
  CatalogueJsonFormatError,
  formatCatalogueJson,
  removeCataloguePhoto,
  removeUnhashedCataloguePhoto,
  reorderCataloguePhotos,
} from '@/utils/formatCatalogueJson';

describe('formatCatalogueJson', () => {
  it('pretty-prints with product-uid first', () => {
    const out = formatCatalogueJson('{"price":1,"product-uid":"AA-BB-001"}');
    expect(out.indexOf('"product-uid"')).toBeLessThan(out.indexOf('"price"'));
    expect(out).toContain('\n');
  });

  it('rejects invalid JSON with a message', () => {
    expect(() => formatCatalogueJson('{')).toThrow(CatalogueJsonFormatError);
  });
});

describe('removeCataloguePhoto', () => {
  it('drops one shape and length photo and keeps the other', () => {
    const text = JSON.stringify({
      'product-uid': 'AA-BB-001',
      photos: {
        $almond: { $medium: [{ photo: '1', hash: 'a' }, { photo: '2', hash: 'b' }] },
        $square: { $short: [{ photo: '1', hash: 'c' }] },
      },
    });
    const out = JSON.parse(
      removeCataloguePhoto(text, { photo: '1', shapeKey: 'almond', lengthKey: 'medium', variationKey: '' }),
    ) as { photos: { $almond: { $medium: Array<{ photo: string }> }; $square: { $short: Array<{ photo: string }> } } };
    expect(out.photos.$almond.$medium.map((entry) => entry.photo)).toEqual(['2']);
    expect(out.photos.$square.$short.map((entry) => entry.photo)).toEqual(['1']);
  });

  it('drops a photo from a flat accessory list', () => {
    const text = JSON.stringify({
      photos: [{ photo: '1', hash: 'a' }, { photo: '2', hash: 'b' }],
    });
    const out = JSON.parse(
      removeCataloguePhoto(text, { photo: '2', shapeKey: '', lengthKey: '', variationKey: '' }),
    ) as { photos: Array<{ photo: string }> };
    expect(out.photos.map((entry) => entry.photo)).toEqual(['1']);
  });

  it('drops a pack photo without touching another pack', () => {
    const text = JSON.stringify({
      photos: { x5: [{ photo: '1', hash: 'a' }], x10: [{ photo: '1', hash: 'b' }] },
    });
    const out = JSON.parse(
      removeCataloguePhoto(text, { photo: '1', shapeKey: 'x5', lengthKey: '', variationKey: '' }),
    ) as { photos: { x5: unknown[]; x10: Array<{ photo: string }> } };
    expect(out.photos.x5).toEqual([]);
    expect(out.photos.x10.map((entry) => entry.photo)).toEqual(['1']);
  });

  it('drops a variation photo only from that option', () => {
    const text = JSON.stringify({
      'is-variation': true,
      '$color.honey-glow': { photos: { $almond: { $medium: [{ photo: '1', hash: 'a' }] } } },
      '$color.dark-honey-glow': { photos: { $almond: { $medium: [{ photo: '1', hash: 'b' }] } } },
    });
    const out = JSON.parse(
      removeCataloguePhoto(text, {
        photo: '1',
        shapeKey: 'almond',
        lengthKey: 'medium',
        variationKey: 'honey-glow',
      }),
    ) as {
      '$color.honey-glow': { photos: { $almond: { $medium: unknown[] } } };
      '$color.dark-honey-glow': { photos: { $almond: { $medium: unknown[] } } };
    };
    expect(out['$color.honey-glow'].photos.$almond.$medium).toEqual([]);
    expect(out['$color.dark-honey-glow'].photos.$almond.$medium).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    expect(() =>
      removeCataloguePhoto('{', { photo: '1', shapeKey: '', lengthKey: '', variationKey: '' }),
    ).toThrow(CatalogueJsonFormatError);
  });
});

describe('reorderCataloguePhotos', () => {
  it('reorders one shape and length and leaves the other list', () => {
    const text = JSON.stringify({
      'product-uid': 'AA-BB-001',
      photos: {
        $almond: {
          $medium: [
            { photo: '1', hash: 'a' },
            { photo: '2', hash: 'b' },
            { photo: '3', hash: 'c' },
          ],
        },
        $square: { $short: [{ photo: '1', hash: 'd' }] },
      },
    });
    const out = JSON.parse(
      reorderCataloguePhotos(text, { shapeKey: 'almond', lengthKey: 'medium', variationKey: '' }, ['3', '1', '2']),
    ) as {
      photos: {
        $almond: { $medium: Array<{ photo: string; hash: string }> };
        $square: { $short: Array<{ photo: string }> };
      };
    };
    expect(out.photos.$almond.$medium.map((entry) => entry.hash)).toEqual(['c', 'a', 'b']);
    expect(out.photos.$square.$short.map((entry) => entry.photo)).toEqual(['1']);
  });

  it('reorders a flat accessory list', () => {
    const text = JSON.stringify({
      photos: [
        { photo: '1', hash: 'a' },
        { photo: '2', hash: 'b' },
      ],
    });
    const out = JSON.parse(
      reorderCataloguePhotos(text, { shapeKey: '', lengthKey: '', variationKey: '' }, ['2', '1']),
    ) as { photos: Array<{ photo: string }> };
    expect(out.photos.map((entry) => entry.photo)).toEqual(['2', '1']);
  });

  it('reorders one variation option only', () => {
    const text = JSON.stringify({
      'is-variation': true,
      '$color.honey-glow': {
        photos: {
          $almond: {
            $medium: [
              { photo: '1', hash: 'a' },
              { photo: '2', hash: 'b' },
            ],
          },
        },
      },
      '$color.dark-honey-glow': { photos: { $almond: { $medium: [{ photo: '1', hash: 'c' }] } } },
    });
    const out = JSON.parse(
      reorderCataloguePhotos(
        text,
        { shapeKey: 'almond', lengthKey: 'medium', variationKey: 'honey-glow' },
        ['2', '1'],
      ),
    ) as {
      '$color.honey-glow': { photos: { $almond: { $medium: Array<{ photo: string }> } } };
      '$color.dark-honey-glow': { photos: { $almond: { $medium: Array<{ photo: string }> } } };
    };
    expect(out['$color.honey-glow'].photos.$almond.$medium.map((entry) => entry.photo)).toEqual(['2', '1']);
    expect(out['$color.dark-honey-glow'].photos.$almond.$medium.map((entry) => entry.photo)).toEqual(['1']);
  });
});

describe('addCataloguePhoto', () => {
  it('appends a stem to a flat accessory list and drops it while unhashed', () => {
    const text = JSON.stringify({ photos: [{ photo: '1', hash: 'a' }] });
    const added = addCataloguePhoto(text, 'kit');
    const parsed = JSON.parse(added) as { photos: Array<{ photo: string; hash?: string }> };
    expect(parsed.photos.map((entry) => entry.photo)).toEqual(['1', 'kit']);
    const removed = JSON.parse(removeUnhashedCataloguePhoto(added, 'kit')) as {
      photos: Array<{ photo: string }>;
    };
    expect(removed.photos.map((entry) => entry.photo)).toEqual(['1']);
  });

  it('appends into the first shape and length and does not duplicate a stem', () => {
    const text = JSON.stringify({
      available: { $almond: { $medium: { XS: 1 } } },
      photos: { $almond: { $medium: [{ photo: '1', hash: 'a' }] }, $square: { $short: [] } },
    });
    const once = addCataloguePhoto(text, 'kit');
    const twice = addCataloguePhoto(once, 'kit');
    const parsed = JSON.parse(twice) as {
      photos: { $almond: { $medium: Array<{ photo: string }> }; $square: { $short: unknown[] } };
    };
    expect(parsed.photos.$almond.$medium.map((entry) => entry.photo)).toEqual(['1', 'kit']);
    expect(parsed.photos.$square.$short).toEqual([]);
  });

  it('creates the first available list when photos are empty', () => {
    const text = JSON.stringify({
      available: { $almond: { $medium: { XS: 1 } } },
      photos: {},
    });
    const parsed = JSON.parse(addCataloguePhoto(text, 'kit')) as {
      photos: { $almond: { $medium: Array<{ photo: string }> } };
    };
    expect(parsed.photos.$almond.$medium).toEqual([{ photo: 'kit' }]);
  });

  it('names the file on the first variation option only', () => {
    const text = JSON.stringify({
      'is-variation': true,
      available: { $almond: { $medium: { XS: 1 } } },
      '$color.honey-glow': { photos: { $almond: { $medium: [{ photo: '1', hash: 'a' }] } } },
      '$color.dark-honey-glow': { photos: { $almond: { $medium: [{ photo: '1', hash: 'b' }] } } },
    });
    const parsed = JSON.parse(addCataloguePhoto(text, 'kit')) as {
      '$color.honey-glow': { photos: { $almond: { $medium: Array<{ photo: string }> } } };
      '$color.dark-honey-glow': { photos: { $almond: { $medium: Array<{ photo: string }> } } };
    };
    expect(parsed['$color.honey-glow'].photos.$almond.$medium.map((entry) => entry.photo)).toEqual(['1', 'kit']);
    expect(parsed['$color.dark-honey-glow'].photos.$almond.$medium.map((entry) => entry.photo)).toEqual(['1']);
  });
});
