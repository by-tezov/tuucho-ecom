import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  publicGiftItem,
  publicDestination,
  receiverFilterOptions,
  stripGalleryPrices,
} from '../../../../../src/modules/gift/application/presenters.js';
import { giftFrontendPath } from '../../../../../src/modules/gift/infrastructure/giftUrls.js';
import type { GiftItemRow } from '../../../../../src/modules/gift/infrastructure/giftItemRepo.js';

function item(overrides: Partial<GiftItemRow> = {}): GiftItemRow {
  return {
    productId: 'p1',
    productUid: 'uid',
    productType: 'nail',
    shapeKey: 'almond',
    lengthKey: 'medium',
    size: 'M',
    packKey: '',
    quantity: 1,
    unitPrice: 10,
    ...overrides,
  } as GiftItemRow;
}

test('publicGiftItem hides prices when requested', () => {
  assert.deepEqual(publicGiftItem(item(), true), {
    productId: 'p1',
    productUid: 'uid',
    productType: 'nail',
    shapeKey: 'almond',
    lengthKey: 'medium',
    size: 'M',
    packKey: '',
    quantity: 1,
  });
  assert.equal(publicGiftItem(item({ quantity: 2 }), false).lineTotal, 20);
});

test('stripGalleryPrices and receiverFilterOptions clamp price range', () => {
  assert.equal(stripGalleryPrices({ id: '1', price: 12 } as never).price, undefined);
  const options = {
    priceRange: { min: 5, max: 80 },
  } as never;
  assert.deepEqual(receiverFilterOptions(options, true, 40).priceRange, null);
  assert.deepEqual(receiverFilterOptions(options, false, 40).priceRange, { min: 5, max: 40 });
});

test('publicDestination returns null without a row', () => {
  assert.equal(publicDestination(undefined), null);
  assert.equal(
    publicDestination({
      recipientName: 'Ada',
      companyName: null,
      line1: '1 rue',
      line2: null,
      deliveryNotes: null,
      postalCode: '75001',
      city: 'Paris',
      countryCode: 'FR',
      phone: null,
      courierCode: 'mondial',
      networkCodes: ['home'],
      pickupPoints: {},
    } as never)?.city,
    'Paris',
  );
});

test('giftFrontendPath prefixes the language', () => {
  assert.equal(giftFrontendPath('/gift/abc', 'fr'), '/fr/gift/abc');
  assert.equal(giftFrontendPath('gift/abc', 'en'), '/en/gift/abc');
});
