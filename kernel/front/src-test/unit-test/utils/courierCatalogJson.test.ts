import { describe, expect, it } from 'vitest';
import type { CourierCatalogCourier } from '@/api/contract/admin/courierCatalog';
import {
  CourierJsonFormatError,
  courierDocument,
  formatCourierJson,
  measurementDocument,
} from '@/utils/courierCatalogJson';

const text = { en: 'En', fr: 'Fr' };

function courier(patch: Partial<CourierCatalogCourier> = {}): CourierCatalogCourier {
  return {
    code: 'mondial-relay-home',
    sortOrder: 2,
    name: text,
    description: text,
    countries: [
      { code: 'FR', minDays: 3, maxDays: 5, custodyDays: null },
      { code: 'BE', minDays: 3, maxDays: 6, custodyDays: null },
    ],
    packets: [
      {
        key: 'solo',
        sortOrder: 0,
        maxQuantity: 1,
        prices: [
          { country: 'FR', price: 4.99, expressPrice: null },
          { country: 'BE', price: 4.99, expressPrice: null },
        ],
      },
    ],
    ...patch,
  };
}

describe('courierDocument', () => {
  it('keeps grouped keys and folds a shared price into one number', () => {
    const document = courierDocument(courier());
    expect(document).not.toHaveProperty('enabled');
    expect(document).not.toHaveProperty('trackingAvailable');
    expect(document).not.toHaveProperty('custodyTime');
    expect(document.name).toEqual({ en: 'En', fr: 'Fr' });
    expect(document.deliveryTime).toEqual({ FR: { min: 3, max: 5 }, BE: { min: 3, max: 6 } });
    expect(document.packets).toEqual([{ key: 'solo', maxQuantity: 1, price: 4.99 }]);
  });

  it('writes one hold-day value and a price map when countries differ', () => {
    const document = courierDocument(
      courier({
        countries: [
          { code: 'FR', minDays: 3, maxDays: 5, custodyDays: 5 },
          { code: 'BE', minDays: 3, maxDays: 5, custodyDays: 5 },
        ],
        packets: [
          {
            key: 'solo',
            sortOrder: 0,
            maxQuantity: 1,
            prices: [
              { country: 'FR', price: 4.1, expressPrice: 1 },
              { country: 'BE', price: 4.45, expressPrice: 1 },
            ],
          },
        ],
      }),
    );
    expect(document.custodyTime).toBe(5);
    expect(document.packets).toEqual([
      { key: 'solo', maxQuantity: 1, price: { FR: 4.1, BE: 4.45 }, expressPrice: 1 },
    ]);
  });
});

describe('measurementDocument', () => {
  it('matches the parcel file', () => {
    expect(measurementDocument([{ quantity: 1, weight: 120, length: 18, width: 8, depth: 4 }])).toEqual({
      '1': { weight: 120, size: { length: 18, width: 8, depth: 4 } },
    });
  });
});

describe('formatCourierJson', () => {
  it('pretty-prints an object and rejects a list', () => {
    expect(formatCourierJson('{"sortOrder":1}')).toBe('{\n  "sortOrder": 1\n}\n');
    expect(() => formatCourierJson('[1]')).toThrow(CourierJsonFormatError);
  });
});
