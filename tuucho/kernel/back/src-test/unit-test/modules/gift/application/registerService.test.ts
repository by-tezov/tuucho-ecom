import { test } from 'node:test';
import assert from 'node:assert/strict';
import register from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/register.js';

/** The registered plugin service is the only supported way for peer plugins
 * to reach gift internals (receiver surface, PIN/lock/cart helpers,
 * classification). */
test('the gift plugin service exports the receiver surface for peers', async () => {
  let service: Record<string, unknown> | undefined;
  await register({
    pluginId: 'tuucho-commerce-gift',
    registerPluginService: (_id: string, api: Record<string, unknown>) => {
      service = api;
    },
    registerHttpMount: () => {},
    addFilter: () => {},
  } as never);
  assert.ok(service, 'registerPluginService was called');
  for (const key of [
    'loadReceiverOffer',
    'loadReceiverSummary',
    'putReceiverItem',
    'removeReceiverItem',
    'putReceiverDestination',
    'assertGiftPinSession',
    'unlockGiftPin',
    'coveringStockReservationIdForActiveCart',
    'isNailGiftItem',
    'isAccessoryGiftItem',
    'remainingFrom',
  ]) {
    assert.equal(typeof service[key], 'function', `missing service export ${key}`);
  }
  const isNailGiftItem = service.isNailGiftItem as (item: { productType: string }) => boolean;
  assert.equal(isNailGiftItem({ productType: 'composition' }), true);
  assert.equal(isNailGiftItem({ productType: 'accessory' }), false);
});
