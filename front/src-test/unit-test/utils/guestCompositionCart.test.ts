import { describe, expect, it } from 'vitest';
import type { CartComposition } from '../../../src/api/cart';
import type { GalleryItem } from '../../../src/data/types';
import type { GuestCompositionLine } from '../../../src/state/guestCart';
import { rememberNailItems } from '../../../src/utils/nailItemCache';
import {
  compositionsToImportPayload,
  guestCompositionsToCart,
} from '../../../src/utils/guestCompositionCart';

const nailItem = {
  id: 'nail-1',
  productUid: 'NAIL-1',
  title: 'Rose',
  price: 4,
  shape: { almond: 'Amande' },
  lengthsByShape: { almond: { medium: 'Moyen' } },
  photosByShapeLength: {
    almond: { medium: [{ small: 'plain.webp', modal: 'plain-m.webp' }] },
  },
  photosByVariation: {
    almond: {
      medium: {
        glossy: [{ small: 'glossy.webp', modal: 'glossy-m.webp' }],
      },
    },
  },
  variation: {
    label: 'Finition',
    options: [
      { key: 'glossy', label: 'Brillant', price: 6 },
      { key: 'matte', label: 'Mat' },
    ],
  },
  available: { almond: { medium: { M: 1 } } },
  availableByOption: {
    glossy: { almond: { medium: { M: 2 } } },
    matte: { almond: { medium: { M: 0 } } },
  },
} as unknown as GalleryItem;

const guestLine = (overrides: Partial<GuestCompositionLine> = {}): GuestCompositionLine => ({
  id: 'g1',
  size: 'M',
  quantity: 1,
  nails: [
    {
      productId: 'nail-1',
      shapeKey: 'almond',
      lengthKey: 'medium',
      finger: 'left-thumb',
      variationKey: 'glossy',
    },
  ],
  ...overrides,
});

describe('guestCompositionsToCart', () => {
  it('builds priced nails from itemsById with variation wiring', () => {
    const [composition] = guestCompositionsToCart([guestLine()], { 'nail-1': nailItem }, 'fr');
    expect(composition.unitPrice).toBe(6);
    expect(composition.available).toBe(true);
    expect(composition.nails[0]).toMatchObject({
      productId: 'nail-1',
      productUid: 'NAIL-1',
      title: 'Rose',
      variationKey: 'glossy',
      variationLabel: 'Brillant',
      variationAxisLabel: 'Finition',
      photo: 'glossy.webp',
      unitPrice: 6,
      available: true,
    });
  });

  it('falls back to the nail cache when itemsById has no entry', () => {
    rememberNailItems([nailItem], 'en');
    const [composition] = guestCompositionsToCart([guestLine()], {}, 'en');
    expect(composition.nails[0].title).toBe('Rose');
    expect(composition.nails[0].unitPrice).toBe(6);
  });

  it('stubs missing nails as unavailable at zero price', () => {
    const [composition] = guestCompositionsToCart(
      [
        guestLine({
          nails: [
            {
              productId: 'gone',
              shapeKey: 'almond',
              lengthKey: 'medium',
              finger: 'left-thumb',
              variationKey: 'glossy',
            },
          ],
        }),
      ],
      {},
      'fr',
    );
    expect(composition.available).toBe(false);
    expect(composition.unitPrice).toBe(0);
    expect(composition.nails[0]).toMatchObject({
      productId: 'gone',
      productUid: '',
      title: '',
      available: false,
      unitPrice: 0,
      photo: null,
      variationKey: 'glossy',
    });
  });

  it('marks the set unavailable when a variation is not offered', () => {
    const [composition] = guestCompositionsToCart(
      [
        guestLine({
          nails: [
            {
              productId: 'nail-1',
              shapeKey: 'almond',
              lengthKey: 'medium',
              finger: 'left-thumb',
              variationKey: 'matte',
            },
          ],
        }),
      ],
      { 'nail-1': nailItem },
      'fr',
    );
    expect(composition.available).toBe(false);
    expect(composition.nails[0].unitPrice).toBe(4);
  });
});

describe('compositionsToImportPayload', () => {
  it('keeps variationKey on each nail', () => {
    const compositions: CartComposition[] = [
      {
        id: 'c1',
        size: 'M',
        quantity: 2,
        editing: false,
        unitPrice: 6,
        available: true,
        nails: [
          {
            productId: 'nail-1',
            productUid: 'NAIL-1',
            title: 'Rose',
            shapeKey: 'almond',
            lengthKey: 'medium',
            shapeLabel: 'Amande',
            lengthLabel: 'Moyen',
            finger: 'left-thumb',
            variationKey: 'glossy',
            variationLabel: 'Brillant',
            variationAxisLabel: 'Finition',
            photo: 'glossy.webp',
            unitPrice: 6,
            available: true,
          },
        ],
      },
    ];
    expect(compositionsToImportPayload(compositions)).toEqual([
      {
        size: 'M',
        quantity: 2,
        nails: [
          {
            productId: 'nail-1',
            shapeKey: 'almond',
            lengthKey: 'medium',
            finger: 'left-thumb',
            variationKey: 'glossy',
          },
        ],
      },
    ]);
  });
});
