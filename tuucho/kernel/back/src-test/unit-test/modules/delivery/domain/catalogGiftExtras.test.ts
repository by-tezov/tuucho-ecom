import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  courierCountryCatalogBlockReason,
  courierCountryCatalogReady,
} from '../../../../../src/modules/delivery/domain/courierCountryCatalog.js';
import { frozenGiftSnapshot } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/snapshot.js';
import {
  parseGiftShareCardStyle,
  persistGiftShareCardStyle,
} from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/shareCardStyle.js';

test('courierCountryCatalogReady requires times and packet prices', () => {
  const courier = {
    countries: [{ code: 'FR' }, { code: 'BE' }],
    deliveryTimes: {
      FR: { custodyDays: 2 },
      BE: { custodyDays: 3 },
    },
    packets: [{ price: { FR: 5, BE: 6 }, expressPrice: { FR: 9, BE: 10 } }],
  };
  assert.equal(courierCountryCatalogReady(courier, 'FR'), true);
  assert.equal(courierCountryCatalogBlockReason(courier, 'DE'), 'packet_price_missing');
  assert.equal(
    courierCountryCatalogBlockReason(
      { ...courier, deliveryTimes: { FR: { custodyDays: 2 } } },
      'BE',
    ),
    'delivery_time_missing',
  );
  assert.equal(
    courierCountryCatalogBlockReason(
      {
        ...courier,
        packets: [{ price: { FR: 5, BE: 6 }, expressPrice: { FR: 9 } }],
      },
      'BE',
    ),
    'express_price_incomplete',
  );
});

test('frozenGiftSnapshot copies the freeze fields only', () => {
  const snap = frozenGiftSnapshot({
    offerId: 'o1',
    giverDisplayName: 'A',
    receiverName: 'B',
    giverEmail: 'a@example.com',
    receiverEmail: 'b@example.com',
    giverComment: null,
    maxSets: 2,
    maxBudget: 100,
    allowAccessories: true,
    maxAccessoryBudget: 20,
    hideReceiverPrices: false,
  });
  assert.equal(snap.offerId, 'o1');
  assert.equal(snap.maxSets, 2);
  assert.equal(snap.giverEmail, 'a@example.com');
  assert.equal(snap.receiverEmail, 'b@example.com');
});

test('parseGiftShareCardStyle accepts current and legacy keys', () => {
  assert.equal(parseGiftShareCardStyle('mariage'), 'mariage');
  assert.equal(parseGiftShareCardStyle('classic'), 'classic');
  assert.equal(parseGiftShareCardStyle('pamsurin'), 'classic');
  assert.equal(parseGiftShareCardStyle('birthday'), 'anniversaire');
  assert.equal(parseGiftShareCardStyle('unknown'), null);
  assert.equal(parseGiftShareCardStyle(1), null);
});

test('persistGiftShareCardStyle writes classic, not a shop brand', () => {
  assert.equal(persistGiftShareCardStyle('classic'), 'classic');
  assert.equal(persistGiftShareCardStyle('mariage'), 'mariage');
});
